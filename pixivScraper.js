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
let testCounter = 0;


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
	await page.goto(loginUrl);
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



//Steps through the artists pages, going to the individual art pages
async function stepThroughArtist(browser, page, artistID, filter, fArgs){
	var acceptedPics = [];
	var baseArtistURL = "https://www.pixiv.net/member_illust.php?id=" + artistID + "&type=illust&p="; //base url for picture pages of an artist 
	var counter = 1; //page counter
	await page.goto(baseArtistURL + counter.toString());
	
	var hasNextPage = true;
	await page.waitForFunction('document.querySelector("#root")');
	await page.screenshot({path: 'arrivedAtArtistPage.png', fullPage: true});
	while (hasNextPage){
		let tempPicStorage =  //the list of image page URLS on the artists page
		await page.evaluate((maxPicPerPage, hasNextPage) => { 
			var container = document.querySelector("#root");
			var hits = container.querySelectorAll("li > div > a");
			let tempPicStorage = [];
			hasNextPage = (hits.length == maxPicPerPage); 
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
		await page.goto(baseArtistURL + counter.toString());
		hasNextPage = false; //remove this when actually testing<----------------------
	}
	console.log("accepted pics: " + acceptedPics);
}

//Checks the specific page and prepares the filters to check if it passes the rule
async function checkImage(browser, page, filter, imgPageURL, fArgs){
	testCounter++;
	console.log("entered checkImage");
	await page.waitFor(2000);
	let result = await page.goto(imgPageURL);
	console.log("result: " + result.status());
	await page.waitForFunction('document.querySelector("#root")');
	//page.waitForNavigation({ waitUntil: 'networkidle0' });
	await page.screenshot({path: 'preClick.png', fullPage: true});
	const singlePiecePage = await page.evaluate(() => { //check if single or multi page
		console.log("singlepiece eval called");
		console.log("buttons: " + document.querySelectorAll("button").length);
		for (let i = 0 ; i < document.querySelectorAll("button").length ; i++){
			if (document.querySelectorAll("button")[i].innerText == "See all"){
				return false;
			}
		}
		return true;}); 
	console.log("singlePiecePage: " + singlePiecePage);
	console.log(page.url());
	if (!singlePiecePage){
		console.log("not single pic page");
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

//Checks if there is a single picture that follows the size requirement
async function biggerThanFilter(browser, page, isSingle, xReq, yReq){
	//let bodyHTML = await page.content();//evaluate(() => document.body.innerHTML);
	//console.log(bodyHTML);
	let imgPageURL = page.url();
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
					if (widthInt > xReq && heightInt > yReq){
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

async function hasTag(browser, page, isSingle, tag){
	
}

(async() => {
	const browser = await puppeteer.launch();
	const page = await browser.newPage();
	await logIn(browser, page);
	page.on('console', consoleObj => console.log(consoleObj.text()));
	//const images = await page.$$eval('img', imgs => imgs.map(img => img.naturalWidth));
	//console.log(images); //this gets the image width 
	//await checkImage(browser, page, biggerThanFilter, "https://www.pixiv.net/member_illust.php?mode=medium&illust_id=75457374", [1,1] );
	await stepThroughArtist(browser, page, 24218478, biggerThanFilter, [1779, 1000]);
	console.log("end");
	await browser.close();
})();