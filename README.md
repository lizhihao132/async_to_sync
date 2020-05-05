# 做什么
		将异步函数转为同步函数，几乎支持所有类型的异步函数: 全局/ 内置/ 第三方库/ 自定义.
		
# 有什么用
		1. 强制某些场景下代码执行顺序与编写顺序一致性. (如自动化测试)
		2. 改造一个没有提供与异步接口相对应的同步接口的库. (如 node-fetch 库, 参考后面的使用示例)
		3. 纯粹为了好玩 (暂未发现有类似功能的库)
		
# 实现
		主要: 将异步函数及它的回调一分为二: 将异步函数放到子线程中执行, 回调函数放到当前线程中执行.
		次要: 跨线程共享结构化数据(异常, 函数实现, 参数 ...), ast 解析.
	
# 局限
		1. 目前仅实现 nodejs 宿主(**version >= 10.5.0**), 浏览器下待实现(有一些工作量).
		2. 没有对 await/async 语法糖处理, 暂只支持带回调的异步函数到同步的转换. 前者适配不麻烦, 测试案例中有一个类似处理(myAsync).
		3. 原异步函数的回调函数若在原事件循环中不会被执行, 则当前线程会整体 hang 住. 可以通过设置 timeout 来避免死锁(见示例5).
		4. 函数/结构化异常信息 在线程中使用 json 传输, 某些信息可能丢失. 不可解: 受限于js多线程共享内存为clone的原始字节.
		5. "异步接口转同步", 往往意味着是一个不好的设计, 且改变了原始代码的逻辑. 要看具体场景是否需要使用.

# 怎么用
```
const asyncLib = require('./async_to_sync.js');
const callAsyncAsSyncByDetailInfo = asyncLib.asyncToSync;
const asyncFuncChangeToSync = asyncLib.hookAsyncToSync;
const callAsyncAsSync = asyncLib.callAsyncAsSync;
```

**1. 全局异步函数测试**
```
  function setTimeoutSync(callback, timeoutMillsecs){
	let asyncInfo = {
		lib_path: null,
		exported_func_name: 'setTimeout',
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
```
<br/>***test_setTimeout输出:***<br/>before settimeout<br/>after settimeout<br/>haha<br/>
<br/>***test_setTimeoutSync输出:***<br/>before settimeout<br/>haha<br/>after settimeout<br/>


**2. 三方库异步函数测试**
```
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

```
<br/>***test_node_fetch_async输出:***<br/>before asyncFetch<br/>after asyncFetch<br/>error code: 0 , document.length: 90623</br>
<br/>***test_node_fetch_async_sync输出:***<br/>before asyncFetch<br/>error code: 0 , document.length: 90623</br>after asyncFetch<br/>

**3. nodejs内置库异步函数测试**
```
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
```
<br/>***test_readFile输出:***</br>before fs.readFile<br/>after fs.readFile<br/>null file length: 4kb<br/>
<br/>***test_readFile_sync输出:***<br/>before fs.readFile<br/>null file length: 4kb<br/>after fs.readFile<br/>

**4. 用户自定义异步函数测试**
```
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
```
<br/>***test_myAsync输出:***<br/>before my async<br/>after my async<br/>hello world~<br/>
<br/>***test_myAsync_sync输出:***<br/>before my async<br/>hello world~<br/>after my async<br/>

**5. 一个较全的异步转同步测试**
```
let num = 999;
function __asyncFunc(callback){
	setTimeout(function(){
		callback('number is: ' + num);
	}, 2000);
}

function test__asyncFunc(){
	let asyncFuncInfo1 = {
		static_func: __asyncFunc,
		timeout: 4000,		//主线程最多 hang 的时间.
		refer_global_obj_stringified_strs: JSON.stringify({num: num})	//异步函数的实现中引用的外部变量.
	};
	
	callAsyncAsSyncByDetailInfo(asyncFuncInfo1, function(str){console.info(str)});	//输出: number is: 999
	
	let asyncFuncInfo2 = {
		static_func: __asyncFunc,
		timeout: 1000,
		refer_global_obj_stringified_strs: JSON.stringify({num: num})
	};
	
	callAsyncAsSyncByDetailInfo(asyncFuncInfo2, function(str){console.info(str)});	//抛出异常: "wait timeout 1000"
}

test__asyncFunc();
```
***输出见代码中的注释部分***

详细使用方法见文件: [async_to_sync_tests.js](https://raw.githubusercontent.com/juniorfans/async_to_sync/master/async_to_sync_tests.js)
