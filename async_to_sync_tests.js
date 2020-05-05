const asyncLib = require('./async_to_sync.js');
const callAsyncAsSyncByDetailInfo = asyncLib.asyncToSync;
const asyncFuncChangeToSync = asyncLib.hookAsyncToSync;
const callAsyncAsSync = asyncLib.callAsyncAsSync;


////////////////////////////////////////////////////////////////
//1. change 'global async function' to sync and test
function setTimeoutSync(callback, timeoutMillsecs){
	let asyncInfo = {
		lib_path: null,
		exported_func_name: 'setTimeout',
		
		callback_at_first: true,	//首个参数是回调函数.
	};
	
	callAsyncAsSyncByDetailInfo(asyncInfo, callback, timeoutMillsecs);
}

function setIntervalSync(callback, timeoutMillsecs){
	let asyncInfo = {
		lib_path: null,
		exported_func_name: 'setInterval',
		
		callback_at_first: true,	//首个参数是回调函数.
	};
	
	callAsyncAsSyncByDetailInfo(asyncInfo, callback, timeoutMillsecs);
}


function test_setTimeoutSync(){
	console.info('before settimeout');
	setTimeoutSync(function(){console.info('haha')}, 1000);
	console.info('after settimeout');
}


////////////////////////////////////////////////////////////////
//2. change 'third library async function' to sync and test
function asyncFetch(url, options, callback){
	const HttpsProxyAgent = require('https-proxy-agent');
	const fetch = require('node-fetch');
	
	options.agent = new HttpsProxyAgent("http://127.0.0.1:12759") 
	
	fetch(url, options).then(function(res){
		if(res.ok){
			return res.text();
		}else{
			callback(res.status, null);
		}
	}).then(function(res){
		callback(0, res);
	});
}

function test_node_fetch_async(){
	console.info("before asyncFetch");
	asyncFetch('http://www.baidu.com', {timeout: 1000, method: "GET"}, function(err, res){console.info('error code:', err, ', cannot find in builtin libdocument.length:', res.length)});
	console.info("after asyncFetch");
}

function test_node_fetch_async_sync(){
	console.info("before sync-asyncFetch");
	asyncFuncChangeToSync(asyncFetch)('http://www.baidu.com', {timeout: 1000, method: "GET"}, function(err, res){console.info('error code:',err, ', document.length:' , res.length)});
	console.info("after sync-asyncFetch");
}

////////////////////////////////////////////////////////////////
//3. change 'builtin library async function' to sync and test

function test_readFile_sync(){
	const fs = require('fs');
	console.info('before fs.readFile');
	asyncFuncChangeToSync(fs.readFile)('./a.js', 'utf-8', function(err, content){console.info(err, 'file length: ' + (!err?content.length: 0))});
	console.info('after fs.readFile');
}


////////////////////////////////////////////////////////////////
//4. change 'user define async function' to sync and test

function myAsync(callback){
	let p = new Promise((resolve, reject) => {
	  resolve('Success!');
	});
	
	p.then(callback);
}


function test_myAsync(){
	console.info('before my async');
	myAsync(function(res){console.info(res);});
	console.info('after my async');
}

function test_myAsync_sync(){
	console.info('before my sync-async');
	asyncFuncChangeToSync(myAsync)(function(res){console.info(res);});
	console.info('after my sync-async');
}

