(function UI(global){
	"use strict";

	var $body, $feed_1, $feed_2, $my_feed,
		$feed_1_content, $feed_2_content,
		$my_feed_content,

		// signal event handler(s)
		toggle_clicks,
		item_clicks,

		// promise wrapper(s)
		rAF,
		docready;

	// pubsub hub
	global.EVT = new EventEmitter2();

	// run everything!
	setup();


	// ***********************************

	function setup() {
		// promise-wrapper for requestAnimationFrame event
		// note: this is a one-time event, so promise OK
		rAF = function rAF() {
			return new Promise(function executor(resolve){
				requestAnimationFrame(resolve);
			});
		},

		// promise-wrapper for DOM-ready event
		// note: this is a one-time event, so promise OK
		docready = function docready() {
			return new Promise(function executor(resolve){
				$(document).ready(resolve);
			});
		};

		// DOM event handlers from promises
		toggle_clicks = promiseBasedEventHandler(function setupToggleClicks(pr){
			pr.then(toggleFeed);
		})
		item_clicks = promiseBasedEventHandler(function setupItemClicks(pr){
			pr.then(selectItem);
		});

		// wait for DOM-ready
		docready()
		.then(DOMSetup);


		// ***********************************

		function DOMSetup() {
			$body = $(document.body);

			$feed_1 = $("[rel*=js-feed-1]");
			$feed_1_content = $feed_1.children("[rel*=js-content]");
			$feed_1.children("[rel*=js-toggle]")
				.on("click",toggle_clicks);

			$feed_2 = $("[rel*=js-feed-2]");
			$feed_2_content = $feed_2.children("[rel*=js-content]");
			$feed_2.children("[rel*=js-toggle]")
				.on("click",toggle_clicks);

			$my_feed = $("[rel*=js-my-feed]");
			$my_feed_content = $my_feed.children("[rel*=js-content]");
			$my_feed_content.on("click","[rel*=js-item]",noop);

			$feed_1.on("click","[rel*=js-item]",item_clicks);
			$feed_2.on("click","[rel*=js-item]",item_clicks);

			EVT.on("feed-insertion",insertFeedItem);
			EVT.on("my-feed-insertion",insertMyFeedItem);
			EVT.on("feed-kill",killFeedItem);

			// signal the feeds setup to proceed
			EVT.emit("setup-feeds");
		}
	}

	function toggleFeed($btn) {
		var $feed = $btn.closest("[rel*=js-feed-]");
		var feed_id = Number( $feed.attr("rel").substr(8) );
		var running = ($feed.attr("data-paused") !== "true");

		// currently running feed?
		if (running) {
			// pause it
			$feed.attr({ "data-paused": "true" });
			$btn.text("resume");
		}
		// paused feed
		else {
			// resume it
			$feed.removeAttr("data-paused");
			$btn.text("pause list");
		}

		// signal status message
		EVT.emit("status-" + feed_id,!running);
	}

	function insertFeedItem(feedID,itemText) {
		var $content;

		// which feed to insert into?
		if (feedID == 1) $content = $feed_1_content;
		else if (feedID == 2) $content = $feed_2_content;

		var $item = $("<a>")
			.addClass("item")
			.attr({ href: "#", rel: "js-item" })
			.text(itemText);

		$content.prepend($item);

		var $items = $content.children("[rel*=js-item]");
		if ($items.length > 20) {
			$items.last().remove();
		}
	}

	function selectItem($item) {
		// item not yet killed?
		if (!$item.is(".killed")) {
			var $feed = $item.closest("[rel*=js-feed-]");
			var feed_id = Number( $feed.attr("rel").substr(8) );

			// signal item selection
			EVT.emit("item-selection",feed_id,$item.text(),$item);
		}
	}

	function insertMyFeedItem(feed_id,$item) {
		var $floating_item = $item.clone().addClass("floating");

		if (feed_id == 1) $floating_item.addClass("first-list");
		else if (feed_id == 2) $floating_item.addClass("second-list");

		var item_dims = $item.offset();
		var item_margin_left = parseInt($item.css("margin-left"),10);
		var item_margin_top = parseInt($item.css("margin-top"),10);

		$floating_item.css({
				left: (Math.round(item_dims.left) - item_margin_left) + "px",
				top: (Math.round(item_dims.top) - item_margin_top) + "px"
			})
			.appendTo($body);

		$item.remove();

		// wait for the next animation frame (CSS junk)
		rAF()
		.then(afterRAF);


		// ***********************************

		function afterRAF() {
			var my_feed_dims = $my_feed_content.offset();

			$floating_item.css({
				left: Math.round(my_feed_dims.left) + "px",
				top: Math.round(my_feed_dims.top) + "px"
			});

			// wait for the transition to end
			fromEventOnce($floating_item,"transitionend")
			.then(afterTransitionEnd);
		}

		function afterTransitionEnd() {
			$floating_item
				.unbind("transitionend")
				.css({ left: "", top: "" })
				.removeClass("floating")
				.prependTo($my_feed_content);
		}
	}

	function killFeedItem($item) {
		$item.addClass("killed");

		// wait for a second
		var pr = new Promise(function resolver(resolve){
			setTimeout(resolve,1000);
		});
		pr.then(function afterDelay(){
			$item.remove();
		});
	}

	// bridge DOM events to promises
	function fromEventOnce($el,evtName,definePromiseChain) {
		var tmp = extractPromiseResolvers(),
			pr = tmp[0],
			resolve = tmp[1];

		$el.on(evtName,onevt);

		return pr;


		// ***********************************

		function onevt(evt){
			noop(evt);

			// unbind event handler since promises are
			// resolvable only once
			$el.off(evtName,onevt);

			resolve($(evt.target));
		}
	}

	function extractPromiseResolvers() {
		var resolveFn, rejectFn,
			p = new Promise(function resolver(resolve,reject){
				resolveFn = resolve;
				rejectFn = reject;
			});
		return [p,resolveFn,rejectFn];
	}

	function promiseBasedEventHandler(definePromiseChain) {
		var pr, resolve, reject;

		// start out with a promise
		getNextPromise();

		return eventHandler;

		// ***********************************

		function eventHandler(evt) {
			noop(evt);

			// resolve previous promise
			resolve($(evt.target));

			// get the next promise ready in case
			// this event fires again
			getNextPromise();
		}

		function getNextPromise() {
			var tmp = extractPromiseResolvers();

			pr = tmp[0];
			resolve = tmp[1];
			reject = tmp[2];

			definePromiseChain(pr);
		}
	}

	function noop(evt) {
		evt.preventDefault();
		evt.stopPropagation();
		evt.stopImmediatePropagation();
	}

})(window);
