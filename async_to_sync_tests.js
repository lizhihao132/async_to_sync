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

function test_setTimeout(){
	console.info('before settimeout');
	setTimeout(function(){console.info('haha')}, 1000);
	console.info('after settimeout');
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
	asyncFetch('https://github.com/', {timeout: 1000, method: "GET"}, function(err, res){console.info('error code:', err, ', document.length:', res.length)});
	console.info("after asyncFetch");
}


function test_node_fetch_async_sync(){
	console.info("before sync-asyncFetch");
	asyncFuncChangeToSync(asyncFetch)('https://github.com/', {timeout: 1000, method: "GET"}, function(err, res){console.info('error code:',err, ', document.length:' , res.length)});
	console.info("after sync-asyncFetch");
}


////////////////////////////////////////////////////////////////
//3. change 'builtin library async function' to sync and test

function test_readFile(){
	const fs = require('fs');
	console.info('before fs.readFile');
	fs.readFile(__filename, 'utf-8', function(err, content){console.info(err, 'file length: ' + (!err?Math.floor(content.length/1024): 0) + ' kb')});
	console.info('after fs.readFile');
}

function test_readFile_sync(){
	const fs = require('fs');
	console.info('before fs.readFile');
	asyncFuncChangeToSync(fs.readFile)(__filename, 'utf-8', function(err, content){console.info(err, 'file length: ' + (!err?Math.floor(content.length/1024): 0) + ' kb')});
	console.info('after fs.readFile');
}


////////////////////////////////////////////////////////////////
//4. change 'user define async function' to sync and test

function myAsync(callback){
	let p = new Promise((resolve, reject) => {
	  resolve('hello world~');
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

////////////////////////////////////////////////////////////////
//5. 一个较全功能的测试

let num = 999;
function __asyncFunc(callback){
	setTimeout(function(){
		callback('number is: ' + num);
	}, 2000);
}

function test__asyncFunc(){
	let asyncFuncInfo1 = {
		static_func: __asyncFunc,
		timeout: 4000,		//主线程最多 hang 的时间, 此处设置一个较大时间让异步函数正常执行完.
		refer_global_obj_stringified_strs: JSON.stringify({num: num})	//异步函数的实现中引用的外部变量.
	};
	
	callAsyncAsSyncByDetailInfo(asyncFuncInfo1, function(str){console.info(str)});	//输出: number is: 999
	
	let asyncFuncInfo2 = {
		static_func: __asyncFunc,
		timeout: 1000,		//此处设置一个小时间, 让主线程超时.
		refer_global_obj_stringified_strs: JSON.stringify({num: num})
	};
	
	callAsyncAsSyncByDetailInfo(asyncFuncInfo2, function(str){console.info(str)});	//抛出异常: "wait timeout 1000"
}


