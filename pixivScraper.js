const puppeteer = require('puppeteer');
const $ = require('cheerio');
const fs = require("fs");
var readline = require('readline-sync');
const loginUrl = 'https://accounts.pixiv.net/login?';	
const pixivUrl = 'https://www.pixiv.net/';
const devices = require('puppeteer/DeviceDescriptors');
const usernameXpath = "//input[@autocomplete='username']";
const passwordXpath = "//input[@autocomplete='current-password']";	
const loginXpath = "#LoginComponent > form > button";
const cookiesFilePath = "src/loginCookies.json"

async function logIn(browser, page){
	if (fs.existsSync(cookiesFilePath)) {
		//file exists
		console.log("found");
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
		console.log('Session has been loaded in the browser');
		}
	}
	await page.goto(loginUrl);
	//await page.waitForNavigation();
	console.log(page.url()); 
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
	await page.goto("https://www.pixiv.net/member_illust.php?id=2087042&type=illust");
	page.screenshot({path: 'full1.png', fullPage: true});

	// Write Cookies
	const cookiesObject = await page.cookies();
	fs.writeFileSync(cookiesFilePath, JSON.stringify(cookiesObject));
	console.log('Session has been saved to ' + cookiesFilePath);
}

(async() => {
	const browser = await puppeteer.launch();
	const page = await browser.newPage();
	await logIn(browser, page);
	await page.screenshot({path: 'new.png', fullPage: true});
	await page.goto("https://www.pixiv.net/member_illust.php?id=24218478&type=illust");
	await page.screenshot({path: 'wanke.png', fullPage: true});
})();