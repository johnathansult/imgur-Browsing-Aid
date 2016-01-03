$('body').ready(main);

var skipPromoted, closeTopBar, removeViaMobileSpans, canSlideShow, slideShowTime, blockedUserList, followedUserList, favoriteCommentList;
var notifyOnSpecialUsers, markIconsViewed, skipViewed, viewedPostsArray;
var postUser, postID;
var rightTrueLeftFalse = true;
var lastCommentUpdateTime = 0, lastCommentUpdateSkipped = false;
var slideShowInterval, slideShowRunning = false, slideShowPaused = false, slideShowSecondsRemaining;
var isFirstPostAfterPageLoad;

//Create a MutationObserver to check for changes on the page.
var mutationObserver = new MutationObserver( function(mutations) {
	for(var i = 0; i < mutations.length; i++){
		var mut = mutations[i];
		for(var j=0; j < mut.addedNodes.length; ++j){
			//console.log(mut.addedNodes[j].className + " ::: " + mut.addedNodes[j].nodeName);
			if(mut.addedNodes[j].className === undefined) continue;
			else if(mut.addedNodes[j].className === "views-info left") {//The following node classNames all change once per new post: humanMsg, point-info left bold, views-info left
				if (isFirstPostAfterPageLoad)
					isFirstPostAfterPageLoad = false;
				onNewPost();
			}
			else if((mut.addedNodes[j].className.indexOf("comment") > -1 || mut.addedNodes[j].className.indexOf("children") > -1) && mut.addedNodes[j].className != "favorite-comment")
				onCommentsLoaded();
		}
	}   
} );
mutationObserver.observe(document, { subtree: true, childList: true });

//Add an event listener so that our "block user" and "follow user" buttons can communicate with us. **Old method of listening, may change to add click event listener to the buttons directly.**
window.addEventListener("message", function(event) {
  if (event.source != window) // Only accept messages from ourself.
    return;

  if (event.data.type && (event.data.type == "FROM_PAGE")) {
	if (event.data.text.indexOf("block") == 0 && event.data.text.indexOf("user:") > -1) {
		var startIndex = event.data.text.indexOf("user:") + 5;
		var userName = event.data.text.substring(startIndex, event.data.text.length);
		blockUser(userName);
	}
	else if (event.data.text.indexOf("follow") == 0 && event.data.text.indexOf("user:") > -1) {
		var startIndex = event.data.text.indexOf("user:") + 5;
		var userName = event.data.text.substring(startIndex, event.data.text.length);
		followUser(userName);
	}
  }
}, false);

$(function() { //Keydown listener
	$(window).keydown(function(e) {
		if(e.which == 37) { //Left arrow key
			rightTrueLeftFalse = false;
			if (slideShowRunning)
				slideShowStop();
		}
		else if (e.which == 39) { //Right arrow key
			rightTrueLeftFalse = true;
			if (slideShowRunning) {
				slideShowSecondsRemaining = slideShowTime;
				updateSlideShowMessage(slideShowSecondsRemaining);
			}
		}
		else if (e.which == 69) { //'e' key
			if (slideShowRunning)
				slideShowStop();
		}
		else if (e.which == 80) { //'p' key
			if (slideShowRunning)
				slideShowPause();
		}
		else if (e.which == 120) { //'F9' key
			if (window.location.href.indexOf("imgur.com/account/favorites/") > -1) //Don't skip already viewed images when browsing your own favorites list.
				return;
		
			if (skipViewed)
				addNotification("Notification:", "Skipping of viewed posts has been temporarily disabled. Press 'F9' to re-enable.");
			else
				addNotification("Notification:", "Skipping of viewed posts has been temporarily enabled. Press 'F9' to disable.");
			
			skipViewed = !skipViewed;
		}
	});
});

/*



*/

//main: Load options from storage and call member functions.
function main() {
	//Load options from storage, close top bar, add the button to block users, and call the onNewPost function.
	chrome.storage.sync.get({ 
		//Set defaults.
		promotedSkipEnabled: false,
		topBarCloseEnabled: true,
		removeViaMobileSpansEnabled: true,
		slideShowModeEnabled: true,
		slideShowSecondsPerPost: 10,
		specialUserNotificationEnabled: true,
		viewedIconsEnabled: true,
		skipViewedPostsEnabled: false
	}, function(items) {
		skipPromoted = items.promotedSkipEnabled;
		closeTopBar = items.topBarCloseEnabled;
		removeViaMobileSpans = items.removeViaMobileSpansEnabled;
		canSlideShow = items.slideShowModeEnabled;
		slideShowTime = items.slideShowSecondsPerPost;
		notifyOnSpecialUsers = items.specialUserNotificationEnabled;
		markIconsViewed = items.viewedIconsEnabled;
		skipViewed = items.skipViewedPostsEnabled;
		
		chrome.storage.local.get({
			viewedPosts: new Array()
		}, function(items2) {
			viewedPostsArray = items2.viewedPosts;
			
			chrome.storage.local.getBytesInUse("viewedPosts", function(bytesInUse) { console.log("viewedPosts bytesInUse: " + bytesInUse + ". length: " + items2.viewedPosts.length); });
			
			if (closeTopBar)
			checkForTopBarAndClose();
	
			addBookmarkButton();
			addFollowButton();
			addBlockButton();
			if (canSlideShow)
				addToggleSlideShowButton();
			if (skipViewed)
				addViewedTexts();
			
			//Give style to our added buttons and other elements.
			var buttonHoverCss = ".addedPostOptionDiv:hover { background-color:#E8E7E6; } .favorite-comment:hover { background-color:#E8E7E6; } .alreadyViewedIdentifier { position:absolute;z-index:1;top:0;right:0;border:1px solid;background-color:#DDDDDD;color:black;font-weight:bold; }";
			var style = document.createElement("style");
			style.appendChild(document.createTextNode(buttonHoverCss));
			document.getElementsByTagName('head')[0].appendChild(style);
			
			isFirstPostAfterPageLoad = true;
			onNewPost();
			setTimeout(function() { //Wait 1500ms to add viewed texts when the page has just loaded. (There must be a better way to wait for thumbnails to load, but I haven't gotten it.)
				addViewedTexts();
			}, 1500);
		});
	});
}

//onCommentsLoaded: Called when comments are loaded or a change is detected in the comments. Calls comment member functions.
function onCommentsLoaded() {
	var d = new Date();
	var currTime = d.getTime();
	//console.log(currTime - lastCommentUpdateTime);
	if (currTime - lastCommentUpdateTime > 500) {
		if (removeViaMobileSpans)
			removeViaElements();
		
		addFavoriteCommentButtons();
		
		lastCommentUpdateTime = currTime;
		//lastCommentUpdateSkipped = false;
	}
	//else
		//lastCommentUpdateSkipped = true;
}

//onNewPost: Called when a new post is viewed.
function onNewPost() {
	var postSkipped = false;
	
	if (skipPromoted && !postSkipped)
		postSkipped = checkIfPromotedPost();

	if(!postSkipped) {
		var postUserElement = document.getElementsByClassName("post-account")[0];
		if (postUserElement !== undefined)
			postUser = postUserElement.innerHTML;
		else
			postUser = "";
		
		var currentURL = window.location.href;
		
		var startIndex = -1;
		if (currentURL.indexOf("imgur.com/gallery/") > -1)
			startIndex = currentURL.indexOf("imgur.com/gallery/") + 18;
		else if (currentURL.indexOf("/favorites/") > -1)
			startIndex = currentURL.indexOf("/favorites/") + 11;
		else if (currentURL.indexOf("imgur.com/a/") > -1)
			startIndex = currentURL.indexOf("imgur.com/a/") + 12;
		
		var lastIndex = currentURL.length;
		if (currentURL.substring(startIndex, currentURL.length).indexOf("/") > -1)
			lastIndex = currentURL.substring(startIndex, currentURL.length).indexOf("/");
		
		if (startIndex > -1)
			postID = currentURL.substring(startIndex, lastIndex);
		else
			postID = "unknown";
		
		checkForBlockedUsers(); //Check to see if post's creator is blocked, then continue to onNewPost2.
	}
}

//onNewPost2: Continuation of onNewPost, called by checkForBlockedUsers when it has finished.
function onNewPost2(postSkipped) {
	if (!postSkipped && skipViewed && !isFirstPostAfterPageLoad) 
		postSkipped = checkIfViewedPost();
	
	if (markIconsViewed && !isFirstPostAfterPageLoad)
		addViewedTexts();
	
	if (!postSkipped) {
		if (postID !== "unknown") {
			if (viewedPostsArray.indexOf(postID) == -1) {
				if (viewedPostsArray.length >= 20000)
					viewedPostsArray.shift(); //Remove first element of the array.
				
				viewedPostsArray.push(postID);
				
				chrome.storage.local.set({
					viewedPosts: viewedPostsArray
				}, function() {});
			}
		}
	}
		
	if (!postSkipped && notifyOnSpecialUsers)
		checkForSpecialUsers();
}

/*



*/

//addBlockButton: Adds block user button to post options.
function addBlockButton() {
	var blockPosterDiv = document.createElement("div");
	blockPosterDiv.setAttribute("style", "text-align:center");
	blockPosterDiv.setAttribute("id", "block-poster");
	blockPosterDiv.setAttribute("class", "addedPostOptionDiv");
	
	var textNode = document.createTextNode("block user");
	blockPosterDiv.appendChild(textNode);
	document.getElementById("options-btn").getElementsByClassName("options")[0].appendChild(blockPosterDiv);
	
	document.getElementById("block-poster").addEventListener("click", function() {
		window.postMessage({ type: "FROM_PAGE", text: "block user:" + postUser }, "*");
	}, false);
}

//addBookmarkButton: Adds bookmark post button to post options.
function addBookmarkButton() {
	var bookmarkPostDiv = document.createElement("div");
	bookmarkPostDiv.setAttribute("style", "text-align:center;");
	bookmarkPostDiv.setAttribute("id", "bookmark-post");
	bookmarkPostDiv.setAttribute("class", "addedPostOptionDiv");
	
	var textNode = document.createTextNode("bookmark post");
	bookmarkPostDiv.appendChild(textNode);
	document.getElementById("options-btn").getElementsByClassName("options")[0].appendChild(bookmarkPostDiv);
	
	bookmarkPostDiv.addEventListener('click', bookmarkPost);
}

//addFavoriteCommentButtons: Removes any existing favorite comment buttons and adds a favorite comment button to each visible comment.
function addFavoriteCommentButtons() {
	var existingFavoriteButtons = document.getElementsByClassName("favorite-comment");
	for (i = 0; i < existingFavoriteButtons.length; i++)
		$('.favorite-comment').remove();
	
	//console.log("adding comment buttons");
	var commentOptionsButtons = document.getElementsByClassName("caption-toolbar edit-button like-combobox-but-not ");
	for (i = 0; i < commentOptionsButtons.length; i++) {
		var favoriteCommentDiv = document.createElement("div");
		favoriteCommentDiv.setAttribute("class", "favorite-comment");
		favoriteCommentDiv.setAttribute("style", "text-align:left;padding-left:10px;;");
		var textNode = document.createTextNode("favorite");
		favoriteCommentDiv.appendChild(textNode);
		//console.log("added favorite comment button");
		commentOptionsButtons[i].getElementsByClassName("options")[0].appendChild(favoriteCommentDiv);
	}
	
	var favoriteCommentDivs = document.getElementsByClassName("favorite-comment");
	for (i = 0; i < favoriteCommentDivs.length; i++)
		favoriteCommentDivs[i].addEventListener("click", favoriteComment);
}

//addFollowButton: Adds follow user button to post options.
function addFollowButton() {
	var followPosterDiv = document.createElement("div");
	followPosterDiv.setAttribute("style", "text-align:center;");
	followPosterDiv.setAttribute("id", "follow-poster");
	followPosterDiv.setAttribute("class", "addedPostOptionDiv");
	
	var textNode = document.createTextNode("follow user");
	followPosterDiv.appendChild(textNode);
	document.getElementById("options-btn").getElementsByClassName("options")[0].appendChild(followPosterDiv);
	
	document.getElementById("follow-poster").addEventListener("click", function() {
		window.postMessage({ type: "FROM_PAGE", text: "follow user:" + postUser }, "*");
	}, false);
}

//addToggleSlideShowButton: Adds slide show toggle button to post options.
function addToggleSlideShowButton() {
	var slideShowToggleDiv = document.createElement("div");
	slideShowToggleDiv.setAttribute("style", "text-align:center;");
	slideShowToggleDiv.setAttribute("id", "follow-poster");
	slideShowToggleDiv.setAttribute("class", "addedPostOptionDiv");
	
	var textNode = document.createTextNode("toggle slideshow");
	slideShowToggleDiv.appendChild(textNode);
	document.getElementById("options-btn").getElementsByClassName("options")[0].appendChild(slideShowToggleDiv);
	
	slideShowToggleDiv.addEventListener("click", slideShowToggle);
}


function addViewedTexts() {
	if (window.location.href.indexOf("imgur.com/account/favorites/") > -1) //Don't add viewed spans on your own favorites list thumbnails.
		return;
	
	var postIcons = document.getElementsByClassName("sg-item grid");
	for (i = 0; i < postIcons.length; i++) {
		if (postIcons[i].getElementsByClassName("alreadyViewedIdentifier").length == 0) {
				var postIconID = postIcons[i].getAttribute("href");
				var startIndex = 1;
				if (postIconID.indexOf("/a/") == 0)
					startIndex = 3;
				
				if (viewedPostsArray.indexOf(postIcons[i].getAttribute("href").substring(startIndex, postIconID.length)) > -1) {
					var viewedSpan = document.createElement("span");
					viewedSpan.setAttribute("class", "alreadyViewedIdentifier");
					viewedSpan.innerHTML = "Viewed";
					
					postIcons[i].appendChild(viewedSpan);
				}
		}
	}
}

//blockUser: Adds user to blocked user list and then skips current post.
function blockUser(userName) {
	if (userName === "") {
		console.log("No username detected, unable to block.");
		return;
	}
	
	console.log("blocking " + userName);
	chrome.storage.sync.get({ 
		useSynchronizedStorage: false
	}, function(items) {
		if (items.useSynchronizedStorage) {
			chrome.storage.sync.get({ 
				//Set defaults.
				blockedUsers: new Array()
			}, function(items) {
				blockedUserList = items.blockedUsers;
				
				blockedUserList.push(userName);
				
				chrome.storage.sync.set({
					blockedUsers: blockedUserList
				}, function() {
					skipPost();
				});
			});
		}
		else {
			chrome.storage.local.get({ 
				//Set defaults.
				blockedUsers: new Array()
			}, function(items) {
				blockedUserList = items.blockedUsers;
				
				blockedUserList.push(userName);
				
				chrome.storage.local.set({
					blockedUsers: blockedUserList
				}, function() {
					skipPost();
				});
			});
		}
	});
}

//bookmarkPost: Adds post to bookmarked posts(favoritedImages).
function bookmarkPost() {
	if (postID === "unknown") {
		alert("Oops, I wasn't able to get the post ID. Please sumbit a bug report with the URL of this page.");
		return;
	}
	
	var bookmarkedArrayMaxLength = 45;
	
	var titleCutoffIndex = 30;
	if (document.getElementsByClassName("post-title font-opensans-bold")[0] < 30)
		titleCutoffIndex = document.getElementsByClassName("post-title font-opensans-bold")[0].innerHTML.length;
	
	
	var shortUrlStartIndex = document.getElementsByClassName("sg-item selected grid")[0].getAttribute("style").indexOf(".com/") + 5;
	var shortUrlEndIndex = document.getElementsByClassName("sg-item selected grid")[0].getAttribute("style").indexOf(".jpg");


	var bookmarkedImg = {
		id: postID, //document.getElementsByClassName("post-image-container")[0].getAttribute("id"),
		imgSrc: document.getElementsByClassName("sg-item selected grid")[0].getAttribute("style").substring(shortUrlStartIndex, shortUrlEndIndex),
		title: document.getElementsByClassName("post-title font-opensans-bold")[0].innerHTML.substring(0, titleCutoffIndex),
		directory: "root"
	}
	
	chrome.storage.sync.get({ 
		useSynchronizedStorage: false
	}, function(items) {
		if (items.useSynchronizedStorage) { //If the they have selected to use Chrome sync for storage...
			chrome.storage.sync.get({ 
				//Set defaults.
				favoritedImages: new Array(),
				favoritedImages1: new Array(),
				favoritedImages2: new Array(),
				favoritedImages3: new Array(),
				favoritedImages4: new Array(),
				favoritedImages5: new Array(),
				favoritedImages6: new Array(),
				favoritedImages7: new Array(),
				favoritedImages8: new Array(),
				favoritedImages9: new Array(),
				favoritedImages10: new Array(),
				favoritedImages11: new Array(),
				favoritedImages12: new Array(),
				favoritedImages13: new Array()
			}, function(items) {
				var bookmarkedImagesArray = items.favoritedImages;
				if (items.favoritedImages1.length > 0)
					bookmarkedImagesArray.push.apply(bookmarkedImagesArray, items.favoritedImages1);
				if (items.favoritedImages2.length > 0)
					bookmarkedImagesArray.push.apply(bookmarkedImagesArray, items.favoritedImages2);
				if (items.favoritedImages3.length > 0)
					bookmarkedImagesArray.push.apply(bookmarkedImagesArray, items.favoritedImages3);
				if (items.favoritedImages4.length > 0)
					bookmarkedImagesArray.push.apply(bookmarkedImagesArray, items.favoritedImages4);
				if (items.favoritedImages5.length > 0)
					bookmarkedImagesArray.push.apply(bookmarkedImagesArray, items.favoritedImages5);
				if (items.favoritedImages6.length > 0)
					bookmarkedImagesArray.push.apply(bookmarkedImagesArray, items.favoritedImages6);
				if (items.favoritedImages7.length > 0)
					bookmarkedImagesArray.push.apply(bookmarkedImagesArray, items.favoritedImages7);
				if (items.favoritedImages8.length > 0)
					bookmarkedImagesArray.push.apply(bookmarkedImagesArray, items.favoritedImages8);
				if (items.favoritedImages9.length > 0)
					bookmarkedImagesArray.push.apply(bookmarkedImagesArray, items.favoritedImages9);
				if (items.favoritedImages10.length > 0)
					bookmarkedImagesArray.push.apply(bookmarkedImagesArray, items.favoritedImages10);
				if (items.favoritedImages11.length > 0)
					bookmarkedImagesArray.push.apply(bookmarkedImagesArray, items.favoritedImages11);
				if (items.favoritedImages12.length > 0)
					bookmarkedImagesArray.push.apply(bookmarkedImagesArray, items.favoritedImages12);
				if (items.favoritedImages13.length > 0)
					bookmarkedImagesArray.push.apply(bookmarkedImagesArray, items.favoritedImages13);
				
				bookmarkedImagesArray.push(bookmarkedImg);
				
				chrome.storage.sync.set({
					favoritedImages: bookmarkedImagesArray.slice(0, bookmarkedArrayMaxLength),
					favoritedImages1: bookmarkedImagesArray.slice(bookmarkedArrayMaxLength , 2 * bookmarkedArrayMaxLength),
					favoritedImages2: bookmarkedImagesArray.slice(2 * bookmarkedArrayMaxLength , 3 * bookmarkedArrayMaxLength),
					favoritedImages3: bookmarkedImagesArray.slice(3 * bookmarkedArrayMaxLength , 4 * bookmarkedArrayMaxLength),
					favoritedImages4: bookmarkedImagesArray.slice(4 * bookmarkedArrayMaxLength , 5 * bookmarkedArrayMaxLength),
					favoritedImages5: bookmarkedImagesArray.slice(5 * bookmarkedArrayMaxLength , 6 * bookmarkedArrayMaxLength),
					favoritedImages6: bookmarkedImagesArray.slice(6 * bookmarkedArrayMaxLength , 7 * bookmarkedArrayMaxLength),
					favoritedImages7: bookmarkedImagesArray.slice(7 * bookmarkedArrayMaxLength , 8 * bookmarkedArrayMaxLength),
					favoritedImages8: bookmarkedImagesArray.slice(8 * bookmarkedArrayMaxLength , 9 * bookmarkedArrayMaxLength),
					favoritedImages9: bookmarkedImagesArray.slice(9 * bookmarkedArrayMaxLength , 10 * bookmarkedArrayMaxLength),
					favoritedImages10: bookmarkedImagesArray.slice(10 * bookmarkedArrayMaxLength , 11 * bookmarkedArrayMaxLength),
					favoritedImages11: bookmarkedImagesArray.slice(11 * bookmarkedArrayMaxLength , 12 * bookmarkedArrayMaxLength),
					favoritedImages12: bookmarkedImagesArray.slice(12 * bookmarkedArrayMaxLength , 13 * bookmarkedArrayMaxLength),
					favoritedImages13: bookmarkedImagesArray.slice(13 * bookmarkedArrayMaxLength , 14 * bookmarkedArrayMaxLength)
				}, function() {
					if (!chrome.runtime.lastError)
						console.log("post bookmarked");
				});
			});
		}
		else {
			chrome.storage.local.get({ 
				//Set defaults.
				favoritedImages: new Array()
			}, function(items) {
				var bookmarkedImagesArray = items.favoritedImages;
				
				bookmarkedImagesArray.push(bookmarkedImg);
				
				chrome.storage.local.set({
					favoritedImages: bookmarkedImagesArray
				}, function() {
					if (!chrome.runtime.lastError)
						console.log("post bookmarked");
				});
			});
		}
	});
}

//checkForBlockedUsers: Checks if post creator is blocks, skips post if user is blocked.
function checkForBlockedUsers() {
	console.log("Checking if user is blocked.");
	chrome.storage.sync.get({ 
		useSynchronizedStorage: false
	}, function(items) {
		if (items.useSynchronizedStorage) { //If the they have selected to use Chrome sync for storage...
			chrome.storage.sync.get({ 
				//Set defaults.
				blockedUsers: new Array()
			}, function(items) {
				blockedUserList = items.blockedUsers;
				
				for (i = 0; i < blockedUserList.length; i++) {
					if (blockedUserList[i].toLowerCase() === postUser.toLowerCase()) {
						console.log("***Post's creator (" + blockedUserList[i] + ") has been blocked, skipping.***");
						if (blockedUserList[i].length > 16)
							addNotification("Previous Post Skipped:", "User is blocked: (" + blockedUserList[i].substring(0, 16) + "...)");
						else
							addNotification("Previous Post Skipped:", "User is blocked: (" + blockedUserList[i] + ")");
						skipPost();
						onNewPost2(true);
						break;
					}
				}
				onNewPost2(false);
			});
		}
		else {
			chrome.storage.local.get({ 
				//Set defaults.
				blockedUsers: new Array()
			}, function(items) {
				blockedUserList = items.blockedUsers;
				
				for (i = 0; i < blockedUserList.length; i++) {
					if (blockedUserList[i].toLowerCase() === postUser.toLowerCase()) {
						console.log("***Post's creator (" + blockedUserList[i] + ") has been blocked, skipping.***");
						if (blockedUserList[i].length > 16)
							addNotification("Previous Post Skipped:", "User is blocked: (" + blockedUserList[i].substring(0, 16) + "...)");
						else
							addNotification("Previous Post Skipped:", "User is blocked: (" + blockedUserList[i] + ")");
						skipPost();
						onNewPost2(true);
						break;
					}
				}
				onNewPost2(false);
			});
		}
	});
}

//checkForSpecialUsers: Checks if the post's creator is a "special" user, notifies if true.
function checkForSpecialUsers() {
	if (postUser.toLowerCase().indexOf("michaelcera") > -1 && postUser.toLowerCase().indexOf("photoshopped") > -1)
		addNotification("Tip:", "Check the username.");
}

//checkForTopBarAndClose: If notifications bar is open, close it.
function checkForTopBarAndClose() {
	var closeButtons = document.getElementsByClassName("cta-close icon-x");
	if (closeButtons.length > 0) {
		closeButtons[0].click();
		console.log("Top bar detected and closed.");
	}
}

//checkIfPromotedPost: If this is a promoted post, skip it.
function checkIfPromotedPost() {
	if (document.getElementsByClassName("promoted-tag").length > 0) {	
		console.log("***Promoted post, skipping.***");
		skipPost();
		return true;
	}
	else 
		return false;
}

//checkIfViewedPost: Checks if this post has already been viewed, skips the post if it has.
function checkIfViewedPost() {
	/*if (window.location.href.indexOf("imgur.com/gallery/") == -1) //If we are not in the gallery: return.
		return;*/
	if (window.location.href.indexOf("imgur.com/account/favorites/") > -1) //Don't skip already viewed images when browsing your own favorites list.
		return;
	
	for (i = 0; i < viewedPostsArray.length; i++){
		if (postID === viewedPostsArray[i]) {
			console.log("Skipping post (Already Viewed): " + postID);
			addNotification("Previous Post Skipped:", "Post Already Viewed");
			skipPost();
			return true;
		}
	}
	return false;
}

//favoriteComment: Adds comment to favoriteComments.
function favoriteComment() {
	var superParent = this.parentNode.parentNode.parentNode.parentNode;
	
	var commentText = "";
	for (i = 0; i < superParent.getElementsByTagName("p")[0].childNodes.length; i++) //Add the innerHTML of each childNode to commentText.
		commentText += superParent.getElementsByTagName("p")[0].childNodes[i].innerHTML;
	
	console.log("https://imgur.com" + superParent.getElementsByClassName("item permalink-caption-link")[0].getAttribute("href"));
	console.log(superParent.getElementsByClassName("author")[0].children[0].innerHTML);
	console.log(commentText);
	
	var comment = {
		url: "https://imgur.com" + superParent.getElementsByClassName("item permalink-caption-link")[0].getAttribute("href"),
		userName: superParent.getElementsByClassName("author")[0].children[0].innerHTML,
		text: commentText
	};
	
	chrome.storage.sync.get({ 
		useSynchronizedStorage: false
	}, function(items) {
		if (items.useSynchronizedStorage) { //If the they have selected to use Chrome sync for storage...
			chrome.storage.sync.get({ 
				//Set defaults.
				favoriteComments: new Array()
			}, function(items) {
				favoriteCommentList = items.favoriteComments;
				
				favoriteCommentList.push(comment);
				
				chrome.storage.sync.set({
					favoriteComments: favoriteCommentList
				}, function() {
					superParent.getElementsByClassName("caption-toolbar edit-button like-combobox-but-not  opened")[0].setAttribute("class", "caption-toolbar edit-button like-combobox-but-not ");
				});
			});
		}
		else {
			chrome.storage.local.get({ 
				//Set defaults.
				favoriteComments: new Array()
			}, function(items) {
				favoriteCommentList = items.favoriteComments;
				
				favoriteCommentList.push(comment);
				
				chrome.storage.local.set({
					favoriteComments: favoriteCommentList
				}, function() {
					superParent.getElementsByClassName("caption-toolbar edit-button like-combobox-but-not  opened")[0].setAttribute("class", "caption-toolbar edit-button like-combobox-but-not ");
				});
			});
		}
	});
	
}

//followUser: Adds user to followed user list.
function followUser(userName) {
	if (userName === "") {
		console.log("No username detected, unable to follow.");
		return;
	}
	
	chrome.storage.sync.get({ 
		useSynchronizedStorage: false
	}, function(items) {
		if (items.useSynchronizedStorage) { //If the they have selected to use Chrome sync for storage...
			chrome.storage.sync.get({ 
				//Set defaults.
				followedUsers: new Array()
			}, function(items) {
				followedUserList = items.followedUsers;
				
				if ($.inArray(userName, followedUserList) > -1) 
					console.log(userName + " already followed.");
				else {
					followedUserList.push(userName);
					console.log("following " + userName);
					
					chrome.storage.sync.set({
						followedUsers: followedUserList
					}, function() {});
				}
			});
		}
		else {
			chrome.storage.local.get({ 
				//Set defaults.
				followedUsers: new Array()
			}, function(items) {
				followedUserList = items.followedUsers;
				
				if ($.inArray(userName, followedUserList) > -1) 
					console.log(userName + " already followed.");
				else {
					followedUserList.push(userName);
					console.log("following " + userName);
					
					chrome.storage.local.set({
						followedUsers: followedUserList
					}, function() {});
				}
			});
		}
	});
}

//permanentlyDisableSpecialUsersNotifications: Sets the option to notify on special users to false.
function permanentlyDisableSpecialUsersNotifications() {
	notifyOnSpecialUsers = false;
	
	chrome.storage.sync.set({
		specialUserNotificationEnabled: notifyOnSpecialUsers
	}, function() {
		if (!chrome.runtime.lastError) 
			addNotification("Notification:", "You have disabled notifications for special users.");
	});
}

//removeViaElements: Removes "via Android" and "via iPhone" links next to comment author names.
function removeViaElements() {
	//Not working everytime, what do we have to wait for?
	var viaClassElements = document.getElementsByClassName("via");
	var origLength = viaClassElements.length;
	
	//console.log("starting removal: " + origLength);
	for (i = 0; i < origLength; i++) {
		//console.log(i + " " + origLength + " removing via: " + viaClassElements[0].parentNode.firstChild.innerHTML);
		viaClassElements[0].parentNode.removeChild(viaClassElements[0]);
	}
	
}

//skipPost: Clicks the next or previous button depending on if the right arrow key or left array key was pushed last.
function skipPost() {
	if (rightTrueLeftFalse)
		document.getElementsByClassName("btn btn-action navNext")[0].click();
	else 
		document.getElementsByClassName("btn navPrev icon icon-arrow-left")[0].click();
}

function slideShowPause() {
	if (slideShowInterval && slideShowRunning) {
		if (slideShowPaused) {
			slideShowStart(true);
			slideShowPaused = false;
		}
		else {
			clearInterval(slideShowInterval);
			slideShowPaused = true;
		}
	}
}

function slideShowStart(unpausing) {
	if (canSlideShow) {
		if (!unpausing) {
			slideShowRunning = true;
			addSlideShowMessageBox();
			slideShowSecondsRemaining = slideShowTime;
			updateSlideShowMessage(slideShowSecondsRemaining);
		}
		
		slideShowInterval = setInterval( function() {
			if (slideShowSecondsRemaining <= 0) {
				document.getElementsByClassName("btn btn-action navNext")[0].click();
				slideShowSecondsRemaining = slideShowTime;
			}
			else
				slideShowSecondsRemaining--;
			updateSlideShowMessage(slideShowSecondsRemaining); //Call function in messageSystemContent.js
		}, 1000);
	}
}

function slideShowStop() {
	if (slideShowInterval) {
		clearInterval(slideShowInterval);
		closeSlideShowMessageBox(); //Call function in messageSystemContent.js
		slideShowPaused = false;
		console.log("Slide show stopped.");
	}
	slideShowRunning = false;
}

function slideShowToggle() {
	if (slideShowRunning)
		slideShowStop();
	else
		slideShowStart(false);
}

function temporarilyStopSkippingViewedPosts() {
	skipViewed = false;
	addNotification("Notification:", "Skipping of viewed posts has been temporarily disabled. Press 'F9' to re-enable.");
}