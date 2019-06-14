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

async function stepThroughArtist(browser, page, artistID, filter, fArgs){
	var acceptedPics = [];
	var baseArtistURL = "https://www.pixiv.net/member_illust.php?id=" + artistID + "&type=illust&p="; //base url for picture pages of an artist 
	var counter = 1; //page counter
	await page.goto(baseArtistURL + counter.toString());
	console.log(page.url());
	page.on('console', consoleObj => console.log(consoleObj.text()));
	var hasNextPage = true;
	await page.waitForFunction('document.querySelector("#root")');
	while (hasNextPage){
		page.evaluate((maxPicPerPage, acceptedPics) => {
			var container = document.querySelector("#root");
			var hits = container.querySelectorAll("li > div > a");
			hasNextPage = (hits.length == maxPicPerPage); 
			for (i = 0; i < hits.length ; i++){ // go through every image on the page 
				if (checkImage(browser, page, filter, hits[i].href)){ //check the image page and add if it passes
					acceptedPics.push(hits[i].href);
				}
			}
		}, maxPicPerPage, acceptedPics);
		counter++;
		await page.goto(baseArtistURL + counter.toString());
		hasNextPage = false;
	}
}

//
async function checkImage(browser, page, filter, imgPageURL){
	await page.goto(imgPageURL);
	await page.waitForFunction('document.querySelector("#root")');
	if(await filter(browser, page, args)){//if it passes requirement
		return true;
	} else {
		return false;
	}
	
}

async function biggerThanFilter(browser, page, xReq, yReq){
	
}

async function hasTag(browser, page, tag){
	
}

(async() => {
	const browser = await puppeteer.launch();
	const page = await browser.newPage();
	await logIn(browser, page);
	await page.screenshot({path: 'new.png', fullPage: true});
	await page.goto("https://www.pixiv.net/member_illust.php?id=24218478&type=illust");
	await page.screenshot({path: 'wanke.png', fullPage: true});
	//const images = await page.$$eval('img', imgs => imgs.map(img => img.naturalWidth));
	//console.log(images); //this gets the image width 
	stepThroughArtist(browser, page, 2087042);
})();