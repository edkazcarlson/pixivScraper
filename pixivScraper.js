const puppeteer = require('puppeteer');
const $ = require('cheerio');
const fs = require("fs");
var sizeOf = require('image-size');
var readline = require('readline-sync');
const loginUrl = 'https://accounts.pixiv.net/login?';	
const pixivUrl = 'https://www.pixiv.net/';
const devices = require('puppeteer/DeviceDescriptors');
const usernameXpath = "//input[@autocomplete='username']";
const passwordXpath = "//input[@autocomplete='current-password']";	
const loginXpath = "#LoginComponent > form > button";
const cookiesFilePath = "src/loginCookies.json"
const maxPicPerPage = 48;
const seeAllButtonPos = 7;
const expandStateNextPos = 62;
const expandStateTryPos = 80;

const filters = ["0: Bigger than width,height"];

/**
 * Logs into the users account through command line 
 * Loads the cookies if available/working, if not creates new cookies and requests login credentials
 * @param browser The browser that is being logged into 
 * @param page The page being used to log into
 */
async function logIn(browser, page){
	if (fs.existsSync(cookiesFilePath)) {
	} else {
		fs.writeFile(cookiesFilePath, '', function (err) {
			if (err) throw err;
				console.log('File is created successfully.');
			});  
	}
	let firstTime = true;
	loginCookies = fs.existsSync(cookiesFilePath);
	if (loginCookies){
		const content = fs.readFileSync(cookiesFilePath);
		const cookiesArr = JSON.parse(content);
		if (cookiesArr.length !== 0) {
			for (let cookie of cookiesArr) {
				await page.setCookie(cookie);
		}
		}
	}
	
	await goToPage(page, loginUrl);
	
	//await page.waitForNavigation();
	while (page.url() != pixivUrl){ //while not logged in
		if (!firstTime){
			console.log("Failed to log in");
		}
		firstTime = false;
		let username = readline.question("What is your username?");
		let logPass = readline.question("What is your password?");
		const usernameField = await page.$x(usernameXpath);
		await usernameField[0].type(username);
		const passwordField = await page.$x(passwordXpath);
		await passwordField[0].type(logPass);
		page.evaluate(() => { document.querySelector("#LoginComponent > form > button").click(); });
		await page.waitForNavigation({ waitUntil: 'networkidle0' });
	} 
	console.log("Logged in");

	// Write Cookies
	const cookiesObject = await page.cookies();
	fs.writeFileSync(cookiesFilePath, JSON.stringify(cookiesObject));
	console.log('Session has been saved to ' + cookiesFilePath);
}



/**
 * Steps through the artists pages, going to the individual art pages to check the image against the filter, prints accepted pictures to console.
 * @param browser The browser being used 
 * @param page The artists page 
 * @param artistID The artist's id. https://www.pixiv.net/member_illust.php?id=1 would be id 1.
 * @param filter The filter function being applied
 * @param fArgs The arry of arguments for the filter being applied. 
 */
async function stepThroughArtist(browser, page, artistID, filter, fArgs){
	var acceptedPics = [];
	var baseArtistURL = "https://www.pixiv.net/member_illust.php?id=" + artistID + "&type=illust&p="; //base url for picture pages of an artist 
	var counter = 1; //page counter
	await page.waitFor(2000);
	await goToPage(page, baseArtistURL + counter.toString());
	
		
	let hasNextPage = true;
	await page.waitForFunction('document.querySelector("#root")');
	
	while (hasNextPage){
		let tempPicStorage =  //the list of image page URLS on the artists page
		await page.evaluate((maxPicPerPage, hasNextPage) => { 
			var container = document.querySelector("#root");
			var hits = container.querySelectorAll("li > div > a");
			let tempPicStorage = [];
			for (i = 0; i < hits.length ; i++){ // go through every image on the page 
				tempPicStorage.push(hits[i].href);
			}
			return tempPicStorage;
		}, maxPicPerPage, hasNextPage);
		for (let i = 0 ; i < tempPicStorage.length; i++){
			if (await checkImage(browser, page, filter, tempPicStorage[i], fArgs)){ //if pic was accepted
				acceptedPics.push(tempPicStorage[i]);
			}
		}
		counter++;
		await page.waitFor(2000);
		await goToPage(page, baseArtistURL + counter.toString());
		await page.waitFor(2000);
		//hasNextPage = false; //remove this when actually testing<----------------------
		hasNextPage = (maxPicPerPage == tempPicStorage.length);
		console.log("hasNextPage: " + hasNextPage);
		console.log("tempPicStorage.length: " + tempPicStorage.length);
		if (hasNextPage == false){
			await page.screenshot({path: 'lastPage.png', fullPage: true});
		}
		
	}
	console.log("accepted pictures: ");
	for (let j = 0 ; j < acceptedPics.length ; j++){
		console.log(acceptedPics[j]);
	}
	
	
	if (getYesNo("Do you wish to save a log?")){
		let today = new Date();
		let logFileName = artistID + "-";
		if (filter == biggerThanFilter){
			logFileName = logFileName + fArgs[0] + "x" + fArgs[1];
		} else {
			console.log("stepThroughArtist not set up log test format for this");
		}
		logFileName = logFileName + "-" + (today.getMonth() + 1) + "-" + today.getDate();
		let logString = "";
		for (let i = 0 ; i < acceptedPics.length; i++){
			logString = logString + acceptedPics[i] + "\n";
		}
		fs.writeFile(logFileName + ".txt", logString, (err) => {
			if (err) throw err;
			console.log("Accepted pictures list is saved to: " +  logFileName);
		});
	}
	
}

/**
 * Prepares the image page for the filter 
 * @param browser The browser being used 
 * @param page The page 
 * @param filter The filter function being applied
 * @param imgPageURL The URL of the image page.
 * @param fArgs The arry of arguments for the filter being applied. 
 * @return Returns a boolean based on if the page passed the rule or not
 */
async function checkImage(browser, page, filter, imgPageURL, fArgs){
	//console.log("enter checkImage: " + imgPageURL);
	await page.waitFor(2000);
	console.log("going to: " +  imgPageURL);
	await goToPage(page, imgPageURL);
	//console.log("result: " + result.status());
	await page.waitForFunction('document.querySelector("#root")');
	//page.waitForNavigation({ waitUntil: 'networkidle0' });
	const singlePiecePage = await page.evaluate(() => { //check if single or multi page
		for (let i = 0 ; i < document.querySelectorAll("button").length ; i++){
			if (document.querySelectorAll("button")[i].innerText == "See all"){
				return false;
			}
		}
		return true;}); 
	if (!singlePiecePage){
		page.evaluate((seeAllButtonPos) => { document.querySelectorAll("button")[seeAllButtonPos].click(); }, seeAllButtonPos); //expands multi image pages
		await page.waitFor(1000);
		/*page.evaluate((expandStateNextPos) => { document.querySelectorAll("button")[expandStateNextPos].click(); }, expandStateNextPos);
		await page.waitFor(1000);
		await page.screenshot({path: testCounter + '_2.png', fullPage: true});
		page.evaluate((expandStateTryPos) => { document.querySelectorAll("button")[expandStateTryPos].click(); }, expandStateTryPos);
		await page.waitFor(1000);
		await page.screenshot({path: testCounter + '_3.png', fullPage: true});*/
	}

	let finalFArgs = [];
	finalFArgs.push(browser);
	finalFArgs.push(page);
	finalFArgs.push(singlePiecePage);
	for (let i = 0 ; i < fArgs.length ; i++){
		finalFArgs.push(fArgs[i]);
	}
	
	if(await filter.apply(this, finalFArgs)){//if it passes requirement
		return true;
	} else {
		return false;
	}
}

/**
 * If the URL contains an image that has a height and width greater than the x requirement and y requirement it returns true.
 * @param browser The browser being used 
 * @param page The page 
 * @param isSingle A boolean that says if the URL contains multiple images
 * @param xReq The image must have equal or greater width than this.
 * @param yReq The image must have equal or greater height than this. 
 * @return Return true if a single image is greater than the width and height requirement.
 */
async function biggerThanFilter(browser, page, isSingle, xReq, yReq){
	//console.log("entered filter");
	//let bodyHTML = await page.content();//evaluate(() => document.body.innerHTML);
	//console.log(bodyHTML);
	let imgPageURL = page.url();
	console.log("imgPageURL: " + imgPageURL);
	const imgId = imgPageURL.slice(imgPageURL.indexOf("illust_id=") + 10);
	var passesFilter = false;
	return page.evaluate((xReq, yReq, passesFilter, imgId) => {
		var aList = document.querySelectorAll("a");
		var picsParsed = 0;
		for (let i = 0 ; i < aList.length ; i++){
			var hits = aList[i].querySelectorAll("img");
			if (hits.length != 0){
				if (aList[i].innerHTML.indexOf("width=\"") != -1 && 
				aList[i].innerHTML.indexOf(imgId) != -1 &&
				aList[i].innerHTML.indexOf("<img") == 0){
					picsParsed++;
					let widthPointer = aList[i].innerHTML.indexOf("width=\"") + 7;
					let widthStr = "";
					while (!isNaN(aList[i].innerHTML.charAt(widthPointer))){ //while it points to a number
						widthStr = widthStr + aList[i].innerHTML.charAt(widthPointer);
						widthPointer++;
					}
					let heightPointer = aList[i].innerHTML.indexOf("height=\"") + 8;
					let heightStr = "";
					while (!isNaN(aList[i].innerHTML.charAt(heightPointer))){ //while it points to a number
						heightStr = heightStr + aList[i].innerHTML.charAt(heightPointer);
						heightPointer++;
					}
					let widthInt = parseInt(widthStr, 10);
					let heightInt = parseInt(heightStr, 10);
					console.log("width: " + widthInt);
					console.log("height: " + heightInt);
					if (widthInt >= xReq && heightInt >= yReq){
						return true;
					}
					//console.log("width is: " + widthStr + " height is: " + heightStr + "");
				}
			}

		}
		return false;
	}, xReq, yReq, passesFilter, imgId);
	console.log("hit end somehow");
}

/**
 * If the image page has a certain tag, return true.
 * @param browser The browser being used 
 * @param page The page 
 * @param isSingle A boolean that says if the URL contains multiple images
 * @param tag The tag that the page must have.
 * @return Return true if the page has the tag.
 */
async function hasTag(browser, page, isSingle, tag){
	
}

/**
 * Chooses the artist, filter, and builds the filter's paramters.
 * @param browser The browser being used 
 * @param page The page 
 */
async function buildFilter(browser, page){
	let hasChosenFilter = false;
	while (!hasChosenFilter){
		for (let i = 0 ; i < filters.length ; i++){
			console.log(filters[i]);
		}
		let filterID = parseInt(readline.question("Which filter do you want? "),10);
		if (filterID == 0){ //if its the biggerThanFilter
			hasChosenFilter = true;
			let width = parseInt(readline.question("What should the width be bigger than or equal to? "), 10);
			let height = parseInt(readline.question("What should the height be bigger than or equal to? "), 10);
			let artistID = 0;
			let artistFound = false;
			while (!artistFound){
				artistID = parseInt(readline.question("What is the artists pixiv ID? "), 10);
				await goToPage(page, "https://www.pixiv.net/member_illust.php?id=" + artistID);
				artistFound = await page.evaluate(() => {
					console.log(document.querySelectorAll("#root").length); 
					return 1 == document.querySelectorAll("#root").length;});
				await page.screenshot({path:  "goToPageFail.png", fullPage: true});
				if (!artistFound){
					console.log("Artist not found");
				}
			}
			await stepThroughArtist(browser, page, artistID, biggerThanFilter, [width, height]);
		} else {
			console.log("Illegal filter ID.");
		}
	}
}

function getYesNo(question){
	let chosenAnswer = false;
	while (!chosenAnswer){
		let answerString = readline.question("\n" + question + " y/n ");
		if (answerString == "y" || answerString == "yes" || answerString == "Yes"){
			chosenAnswer = true;
			return true;
		} else if (answerString == "n" || answerString == "no" || answerString == "No"){
			chosenAnswer = true;
			return false;
		} else {
			console.log("Please give a real answer.");
		}
	}
}

async function goToPage(page, url){
	let reachedPage = false;
	let pageResult;
	while (!reachedPage){
		await page.waitFor(1000);
		try {
			pageResult = await page.goto(url);
			reachedPage = true;
		} catch (err) {
			readline.question("Could not reach " + url + ", check internet access and try again.");
		}
		if (!reachedPage){
			readline.question("Could not reach " + url + ", check internet access and try again.");
		}
	}
	return pageResult;
}

async function downloadImg(page, url){

	/*
	0: Assume that any multi-image page has been expanded
	1: get a list of image to click on
	2: click on image i
	3: jump to the image i on the imgSrcPage
	4: download
	5: on the original page click out, if there are multiple images, click on next to repeat
	
	*/
	const imgSrcPage = await page.browser().newPage();
	imgSrcPage.setCookie = page.cookies();
	
	await goToPage(page, "https://www.pixiv.net/member_illust.php?mode=medium&illust_id=76260810");
	await page.screenshot({path: 'arrivedOnPage.png', fullPage: true});
	//const images = await page.$$eval('img', imgs => imgs.map(img => img.naturalWidth));
	//console.log(images); //this gets the image width 
	//page.evaluate(() => { document.querySelector("#root > div.sc-fzXfPG.bAzGJH > div > div > main > section > div.sc-fzXfQX.bAzGKF > div > figure > div > div > div > a > img").click(); });
	//this is before clicking
	
	//gathering pictures to click	
	let picturesToClick =  [];
	console.log("(1)picturesToClick is a: " + typeof picturesToClick);
	/*picturesToClick = */console.log("page.evaluate is returning a : " + 
	typeof await page.evaluate(() => { 
		var container = document.querySelector("#root");
		var hits = container.querySelectorAll("img");
		let toReturn = [];
		for (i = 0; i < hits.length ; i++){ 
			if (hits[i].src.includes("_p0_master1200")) {
				console.log("pushing");
				toReturn.push(hits[i]);
			}
		}
		console.log("toReturn: " + toReturn[0].src);
		console.log(typeof toReturn);
		return toReturn;
	}));
	
	console.log("(2)picturesToClick is a: " + typeof picturesToClick);
	console.log("picturesToClick len: " + picturesToClick.length);
	
	//click on the image, jump to it in other tab, jump back out of zoom
	for (let i = 0 ; i < picturesToClick.length ; i++){
		await page.evaluate((picturesToClick, i, imgSrcPage) => {
			picturesToClick[i].click();
			let masterURL = (picturesToClick[i].src.replace("img-original", "img-master")).replace("p0_master1200", "p0");
			let imgId = masterURL.slice(masterURL.lastIndexOf("/"), masterURL.length - 1);
			console.log("imgId: " + imgId);
			var viewSource = goToPage(imgSrcPage, masterURL);

		}, picturesToClick, i, imgSrcPage); 
		
		await imgSrcPage.screenshot({path: 'imgSrcPage-Reached.png', fullPage: true});
		fs.writeFile(imgId, await viewSource.buffer(), function(err) {
			if(err) {
				return console.log(err);
			}

			console.log("The file was saved!");
		});
	}

	

}

(async() => {
	const browser = await puppeteer.launch();
	const page = await browser.newPage();

	
	await logIn(browser, page);
	page.on('console', consoleObj => console.log(consoleObj.text()));  //<- For debugging
	await page.screenshot({path: 'epic.png', fullPage: true});
	await downloadImg(page, "hi");
	//const images = await page.$$eval('img', imgs => imgs.map(img => img.naturalWidth));
	//console.log(images); //this gets the image width 
	/*
	let goAgain = true;
	while (goAgain){
		await buildFilter(browser, page);
		goAgain = getYesNo("Do you wish to run again?");
	}*/
	console.log("Finished running");
	await browser.close();
})();