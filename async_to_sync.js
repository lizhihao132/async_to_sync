
module.exports = {
	//inner
	__implement: __implement,
	
	//exported
	asyncToSync: __interface,
	callAsyncAsSync: __interfaceForStaticFunc,
	hookAsyncToSync: __hook,
}

//异常序列化.
function __serializeError(err){
	const {serializeError, de__serializeError} = require('serialize-error');
	log('typeof(serializeError): ' + typeof(serializeError));
	let jsonStr = serializeError(err);
	
	if(typeof(jsonStr) === 'object'){
		jsonStr = JSON.stringify(jsonStr);
	}
	
	return jsonStr;
}

//let DEBUG = 1;
function log(str, force){
	return;
	if(typeof(DEBUG) === 'undefined'){
		return;
	}
	let {isMainThread} = require('worker_threads');
	const fs = require('fs');
	fs.writeFileSync('./debug.txt', '====== ' +  (isMainThread? '[main-thread] ':'[sub-thread] ') + str + '\n', {flag: 'a'});
}

function getRelativeLibPath(relative){
	let curJs = __dirname+'/'
	let e = new RegExp('\\\\', 'g');
	curJs = curJs.replace(e, '/');
	return curJs + relative;
}

//异步函数转换器
class AsyncFuncConverter{
	constructor(){
		this.__cache = new Map();
		this.__builtin_targets = ['fs', 'child_process', 'crypto', 'http', 'https', 'net', 'os', 'path'];
		this.__initCache();
	}
	
	convert(asyncInfo){
		this.builtinAsyncFuncConvert(asyncInfo);
		
		this.normalFuncConvert(asyncInfo);
	}
	
	builtinAsyncFuncConvert(asyncInfo){
		if(asyncInfo.static_func){
			
			/*
			let obj1 = asyncInfo.static_func;
			let obj2 = require('fs').readFile;
			
			let code1 = String(obj1);
			let code2 = String(obj2);
			
			log(code1, true);
			log(code2, true);
			*/
			let builtInLibInfo = this.__find_in_builtin_lib(asyncInfo.static_func);
			if(builtInLibInfo){
				asyncInfo.lib_path = builtInLibInfo.lib_path;
				asyncInfo.exported_func_name = builtInLibInfo.exported_func_name;
				
				asyncInfo.static_func = undefined;
			}
			else{
				//console.info('-------- cannot find in builtin lib');
			}
		}
	}
	
	normalFuncConvert(asyncInfo){
		if(asyncInfo.static_func){
			if(typeof(asyncInfo.static_func) !== 'function'){
				throw "asyncInfo.static_func must be an function";
			}
			
			asyncInfo.static_func_source_str = String(asyncInfo.static_func);
			asyncInfo.static_func = undefined;
		}
	}

	__initCache(){
		let cache = this.__cache;
		let initForLib = function(libName){
			const lib = require(libName);
			for(let funcname in lib){
				if(typeof(lib[funcname]) === 'function'){
					cache.set(lib[funcname], {lib_path: libName, exported_func_name: funcname});
				}
			}
		}
		
		for(let t of this.__builtin_targets){
			initForLib(t);
		}
	}
	__find_in_builtin_lib(mayBuiltInLibFunc){
		return this.__cache.get(mayBuiltInLibFunc);
	}
	
}

const gloal_asyncfunc_converter = new AsyncFuncConverter();
//异步函数解析
class AsyncFuncParse{
	constructor(asyncFuncInfo){
		 this.__async_func_info = asyncFuncInfo;
	}
	
	__getAsyncFunc(){
		let asyncFuncInfo = this.__async_func_info;
		
		//1. 根据 lib.
		if(asyncFuncInfo.lib_path && asyncFuncInfo.exported_func_name){
			
			let lib = require(asyncFuncInfo.lib_path);
			return lib[asyncFuncInfo.exported_func_name];
		}
		//2. global 函数
		else if(asyncFuncInfo.exported_func_name){
			return global[asyncFuncInfo.exported_func_name];
		}
		//3. 序列化的 func 信息.
		else if(asyncFuncInfo.static_func_source_str){
			let pflib = getRelativeLibPath( './parse_function.js');
			log('-----------pflib: ' + pflib);
			const code2Function = require(pflib);
			//log(asyncFuncInfo.static_func_source_str);;
			return code2Function(asyncFuncInfo.static_func_source_str);
		}
		//4. 根据 func 定义.
		else if(asyncFuncInfo.static_func){
			let code = String(asyncFuncInfo.static_func);
			let pflib = getRelativeLibPath( './parse_function.js');
			log('-----------pflib: ' + pflib);
			const code2Function = require(pflib);
			return code2Function(code);
		}
		else{
			throw "cannot parse async function";
		}
	}

	__bindReferObjs(){
		let asyncFuncInfo = this.__async_func_info;
		if(asyncFuncInfo.refer_global_obj_stringified_strs && asyncFuncInfo.refer_global_obj_stringified_strs.length>0){
			let referObjs = JSON.parse(asyncFuncInfo.refer_global_obj_stringified_strs);
			
			for(let attr in referObjs){
				if(referObjs.hasOwnProperty(attr))
				{
					global[attr] = referObjs[attr];
				}
			}
		}
	}

	

	parse(){
		let asyncFunc = this.__getAsyncFunc();
		this.__bindReferObjs();
		return asyncFunc;
	}
}

//数据传输简单协议
class DataTransferHeader{
	constructor(u32array){
		this.__data_header_uint32_array = u32array;
		
		this.__control_bits = {
			NEED_NEXT: 0,		//第 0 位, 表示之后是否还有数据要传输.
			IS_EXCEPTION: 1,	//第 1 位, 表示当前传输的这次数据是否是一个 exception 数据.
			IS_ASYNC: 2,		//第 2 位, 表示: async 函数的回调函数是否也是一个异步的.
		};
	}
	
	getTotalBytes(){
		return this.__data_header_uint32_array[0];
	}
	
	getCurTransferBytes(){
		return this.__data_header_uint32_array[1];
	}
	
	needNextTransfer(){
		return this.__getControlBit(this.__control_bits.NEED_NEXT);
	}
	
	isException(){
		return this.__getControlBit(this.__control_bits.IS_EXCEPTION);
	}
	
	isCallbackAsync(){
		return this.__getControlBit(this.__control_bits.IS_ASYNC);
	}
	
	setTotalByes(tbytes){
		this.__data_header_uint32_array[0] = tbytes;
		return this;
	}
	
	setCurTransferBytes(cbytes){
		this.__data_header_uint32_array[1] = cbytes;
		return this;
	}
	
	__setControlBit(whichBit, yes){
		let b = 1 << whichBit;
		if(true === yes){
			this.__data_header_uint32_array[2] |= b;
		}else{
			this.__data_header_uint32_array[2] &= (~b);
		}
	}
	
	__getControlBit(whichBit){
		let b = 1 << whichBit;
		return (this.__data_header_uint32_array[2] & b) > 0;
	}
	
	setNeedNextTransfer(need){
		this.__setControlBit(this.__control_bits.NEED_NEXT, need);
		return this;
	}
	
	setIsException(isE){
		this.__setControlBit(this.__control_bits.IS_EXCEPTION, isE);
		return this;
	}
	
	setCallbackIsAsync(isA){
		this.__setControlBit(this.__control_bits.IS_ASYNC, isA);
		return this;
	}
}

//线程间共享内存管理
class SharedArrayBufferManager{
	constructor(sab){
		if(sab){
			this.__sab = sab;
		}
		else
		{
			const totalBytes = 1024*1024*10;	//10M bytes.
			this.__sab = new SharedArrayBuffer(totalBytes); 
		}
		
		this.__state_controller_bytes = 16;	//16 个字节: 也即 4 个 uint32, refer to StateLocker.
		this.__data_transfer_controller_bytes = 12;	//12 个字节: 也即 3 个 uint32, 
	}
	
	getSab(){
		return this.__sab;
	}
	
	mapViewOfStateControllers(){
		//https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Int32Array
		return new Int32Array(this.__sab, 0, this.__state_controller_bytes / Int32Array.BYTES_PER_ELEMENT);	//第三个参数指 int32 的个数, 而非字节数.
	}

	//第 0 个整数表示总字节数, 第 1 个整数表示当前传输的字节数, 第 2 个整数表示是否还有后续.
	mapViewOfDataTransferControllers(){
		let curOffset = this.__state_controller_bytes;
		return new DataTransferHeader( new Uint32Array(this.__sab, curOffset, this.__data_transfer_controller_bytes / Uint32Array.BYTES_PER_ELEMENT) );
	}

	mapViewOfDataSharedBuffer(){
		let curOffset = this.__state_controller_bytes + this.__data_transfer_controller_bytes;
		return new Uint8Array(this.__sab, curOffset);
	}
}

//状态锁
class StateLocker{
	constructor(controller){
		this.__controller = controller;
		this.worker_write_data = 3;
		this.main_read_data = 2;
		this.worker_ready = 0;
	}
	
	resetAll(){
		Atomics.store(this.__controller, this.worker_write_data, 0)	//让 worker 处于 不可写 数据的状态. 	0 为可写状态.
		Atomics.store(this.__controller, this.main_read_data, 0)	//让 main 处于 不可读 的状态.		1 为可读状态.
		Atomics.store(this.__controller, this.worker_ready, 0)		//1 表示 woker ready 了.
		
	}
	
	workerReadyWait()
	{
		log('before workerReadyWait');
		Atomics.wait(this.__controller, this.worker_ready, 0); 		
		log('after workerReadyWait');
	}

	workerReadyNotify()
	{
		log('before workerReadyNotify');
		Atomics.store(this.__controller, this.worker_ready, 1);
		Atomics.notify(this.__controller, this.worker_ready);
		log('after workerReadyNotify');
	}
	
	writableNotify(){
		log('before writableNotify');
		Atomics.store(this.__controller, this.worker_write_data, 0);	//设置为 0, 通知可写.
		Atomics.notify(this.__controller, this.worker_write_data);
		log('after writableNotify');
	}
	
	readableWait(timeoutMillsecs){
		log('before readableWait ' + Atomics.load(this.__controller, this.main_read_data));
		let ret = Atomics.wait(this.__controller, this.main_read_data, 0, timeoutMillsecs);		//当被设置为 1 时表示子线程已经写入数据了, 此时主线程可以读. 为 0 表示等待
		Atomics.store(this.__controller, this.main_read_data, 0);		//让它下次继续等待.
		log('after readableWait ' + ret);
		return ret;
	}
	
	writableWait(timeoutMillsecs)
	{
		log('before writableWait');
		let ret = Atomics.wait(this.__controller, this.worker_write_data, 1, timeoutMillsecs); 	// 当设置为 1 则暂停写
		Atomics.store(this.__controller, this.worker_write_data, 1)	//让下次等待.
		log('after writableWait ' + ret);
		return ret;
	}
	
	readableNotify(){
		
		Atomics.store(this.__controller, this.main_read_data, 1);		//设置为 1, 主线程可以读缓存.
		log('before readableNotify ' + this.__controller[this.main_read_data]);
		Atomics.notify(this.__controller, this.main_read_data); 
		log('after readableNotify');		
	}
}

//数据传输通道
class DataTransferChannel{
	constructor(){

	}
	
	__copyUint8Array(src, srcOffset, target, targetOffset, nsize){
		for(let i=0;i < nsize;++ i){
			target[i+targetOffset] = src[i+srcOffset];
		}
	}
	
	
	recieveOn(sabManager, timeout){
		let dataHeader = sabManager.mapViewOfDataTransferControllers();
		let datasBuf = sabManager.mapViewOfDataSharedBuffer();
		
		let locker = new StateLocker(sabManager.mapViewOfStateControllers());
		//locker.resetAll();	//这里如果 reset 会有问题: 子线程可能已经发送过 readableNotify. 此处清除则接收不到消息了.
		
		let tempUint8Array = null;
		let index = 0;
		while(true){
			let waitRes = locker.readableWait(timeout);
			
			if('timed-out' === waitRes){
				log('read wait timeout');
				return {
					is_timeout: true,
				};
			}
			
			if(null === tempUint8Array){
				tempUint8Array = new Uint8Array(dataHeader.getTotalBytes());
			}

			this.__copyUint8Array(datasBuf, 0, tempUint8Array, index, dataHeader.getCurTransferBytes());
			index += dataHeader.getCurTransferBytes();
			
			log('read ' + dataHeader.getCurTransferBytes() + ' bytes, total: ' + dataHeader.getTotalBytes() + ' bytes, is_exception: ' + dataHeader.isException());
			
			if(dataHeader.needNextTransfer()){	//需要继续传.
				log('need next read ...');
				locker.writableNotify();
			}else{
				log('read finished.');
				break;
			}
		}
		
		return {
			is_callback_async: dataHeader.isCallbackAsync(),
			is_exception: dataHeader.isException(),
			data: tempUint8Array,
		};
	}
	
	sendOn(sabManager, resJsonStr, controlInfo, timeout){
		let isException = controlInfo.isException;
		let isCallbackAsync = controlInfo.isCallbackAsync;
		
		let dataHeader = sabManager.mapViewOfDataTransferControllers();
		let dataBuffer = sabManager.mapViewOfDataSharedBuffer();
		let capacity = dataBuffer.length;
		
		dataHeader.setIsException(isException);
		dataHeader.setCallbackIsAsync(isCallbackAsync);
		
		let locker = new StateLocker(sabManager.mapViewOfStateControllers());
		
		const utils = require('util');
		const encoder = new utils.TextEncoder();
		let srcUint8Array = encoder.encode(resJsonStr);
		
		let srcOffset = 0, targetOffset = 0;
		while(true){
			locker.writableWait(timeout);

			let remains = srcUint8Array.length - srcOffset;
			let realTransfromed = 0;
			try{
				if(remains>0){
					realTransfromed = remains<=capacity ? remains : capacity;

					//放置数据.
					this.__copyUint8Array(srcUint8Array, srcOffset, dataBuffer, targetOffset, realTransfromed);
					
					//放置控制字段. 第1个整数表示是否完毕. 第2个整数表示字节数.
					
					srcOffset += realTransfromed;
					remains -= realTransfromed;
					
					dataHeader.setTotalByes(srcUint8Array.length).setCurTransferBytes(realTransfromed).setNeedNextTransfer(remains > 0);
				}else{
					dataHeader.setTotalByes(srcUint8Array.length).setCurTransferBytes(0).setNeedNextTransfer(false);
				}
			}catch(err){
				log( "write exception: " +  (err), {flag: 'a'});
			}
			
			log('write '+realTransfromed+' bytes, total: ' + srcUint8Array.length + ' bytes, targetOffset: ' + targetOffset + '\n');
			
			locker.readableNotify();
			
			if(remains<=0){
				log('write finished');
				break;
			}else{
				log('write remains ' + remains);
			}
		}
	}
}


function __implement (isMainThread){
	let {
		Worker, parentPort, workerData
	} = require('worker_threads');
	const utils = require('util');
	
	if (isMainThread) {
		//log('main-thread at: ' + process.cwd()); process.chdir
		//console.info('running in main-thread');
		let __async_func_info = GetAsyncFuncInfo();
		let __args = GetArgs();
		let timeout = __async_func_info.timeout;
		
		let sabManager = new SharedArrayBufferManager();
		const fs = require('fs');
		let code = fs.readFileSync(__filename, 'utf-8') + '\n __implement(false);';
		const worker = new Worker(code, {
			eval: true,
			workerData: sabManager.getSab()
		});
		
		let __async_res = null;
		
		worker.on('message', (d) => {
			
		});
		worker.on('error', (e) => {
			console.error('parent receive error', e);
		});
		worker.on('exit', (code) => {
			//if (code !== 0)
			//    console.error(new Error(`工作线程使用退出码 ${code} 停止`));
		});
		
		let locker = new StateLocker(sabManager.mapViewOfStateControllers());
		locker.workerReadyWait();

		locker.resetAll();

		let dataChannel = new DataTransferChannel();

		let obj = {async_func_info: __async_func_info, args: __args, async_2_sync_lib_dir: __dirname};
		worker.postMessage(JSON.stringify(obj));
		
		//console.info('main-thread switch to wait for sub-thread finish call async func...');

		let resData = dataChannel.recieveOn(sabManager, timeout);
		
		let tempUint8Array = resData.data;
		let isException = resData.is_exception;
		let isCallbackAsync = resData.is_callback_async;
		let isTimeout = resData.is_timeout;
		
		if(isTimeout){
			//console.info('[main-thread] wait timeout.');
			SetAsyncRes(null,null,null, true);
		}
		else{
			//console.info('[main-thread] now set final result, ' + tempUint8Array.length);
			
			const decoder = new utils.TextDecoder("utf-8");
			let jsonStr = decoder.decode(tempUint8Array);	//Uint8ArrayToString(res)//
			let jsonObj = JSON.parse(jsonStr);
			
			SetAsyncRes(jsonObj, isException, isCallbackAsync);
		}
		//console.info('main-thread return to outter....');
		//异步杀死子线程(本质上是让 js 同步事件队列为空时再杀死子线程): 如果直接杀死, 会导致子线程中的 console 日志不打印.
		setTimeout(function(){
			worker.terminate()
		}, 0);
	} 

	else 
	{
		//log(process.cwd());
		let sabManager = new SharedArrayBufferManager(workerData);
		let locker = new StateLocker(sabManager.mapViewOfStateControllers());
		locker.workerReadyNotify();
		
		let dataChannel = new DataTransferChannel();
		
		let args = null;
		let asyncFuncInfo = null;
		let asyncFunc = null;
		let timeout = 0;
		parentPort.on('message',  function(params){
			log('recive data: ' + params);
			params = JSON.parse(params);
			args = params.args;
			let asyncFuncInfo = params.async_func_info;
			__dirname = params.async_2_sync_lib_dir;		//worker 线程若由 eval 启动, 则 __dirname 会不正确, 此处校准.
			
			//log('typeof(asyncFuncInfo) ' + typeof(asyncFuncInfo));
			
			try{
				asyncFunc = new AsyncFuncParse(asyncFuncInfo).parse();
				timeout = asyncFuncInfo.timeout;
			}catch(err){
				log('parse async func failed. ' + String(err));
			}
			log('parse async func success. ' + typeof(asyncFunc) + ', ' + typeof(typeof(asyncFunc)));
			
			if(typeof(asyncFunc) == 'undefined' || !asyncFunc){

				let jsonStr = JSON.stringify({error: "async function parse failed."});
				log('parse async function failed. will return. ' + jsonStr + '\n');
				dataChannel.sendOn(sabManager, jsonStr, {isException: true}, timeout);
				
				log('parse async func failed final, as undefined.');
				
				return;
			}
			
			log('now call async function, timeout: ' + timeout);
		
			//将异步函数丢进子线程中运行, 并且在子线程中将异常函数给予回调函数的参数发送到主线程.
			let callbackCalled = false;
			let callbackWrap = function(){
				log('typeof (asyncfunc): ' + typeof(asyncFunc));
				//asyncFunc 的回调函数据可能是在异步函数 (如setTimeout) 中被调的
				//asyncFunc 传入的参数可能与实际定义的不符, 比如 asyncFunc 只有一个参数(回调函数), 但若给它也传入了多个参数，会导致此处的匿名回调函数不会被执行到. 于是不会调用 sendOn, 会造成主线程死等.
				
				let createdCallback = function(){
					callbackCalled = true;
					let buf = workerData;
					
					log('in callback  params: ' + typeof(arguments) + ':' + JSON.stringify(arguments) + '\n');
					let resJsonStr = '{}';
					let isException = false;
					try{
						resJsonStr = JSON.stringify(arguments);
					}catch(err){
						resJsonStr = __serializeError(err);
						isException = true;
					}
					
					log('..................... async-call-back end.');
					dataChannel.sendOn(sabManager, resJsonStr, {isException: isException}, timeout);
					process.exit(0);
					return;
				};
				if(!asyncFuncInfo.callback_at_first){
					log('callback of async is at end.');
					args.push(createdCallback);
				}
				else{
					log('callback of async is at first.');
					args.unshift(createdCallback);
				}
				
				asyncFunc(... args);
			}

			try
			{
				callbackWrap();
			}
			catch(err){
				log('call async exception.');
				let jsonStr = __serializeError(err);
				log('call async exception: ' + jsonStr);
				dataChannel.sendOn(sabManager, jsonStr, {isException: true}, timeout);
			}
			
			/*
			//这个逻辑有点问题. 本身 asyncFunc 就是个异步的. 它会立即被执行到.
			if(!callbackCalled){
				log('callback is not called, must sendOn an empty data.');
				dataChannel.sendOn(sabManager, JSON.stringify({warn: "current async[1]\'scallback contains async function call[2], only can wait 1 to finish, cannot wait fot 1 to finish"}), {isCallbackAsync: true}, timeout);
			}
			*/
			
			log('sub thread finished.');
			//console.info('[sub-thread] returning ...');
			//process.exit(0);
		});
		
	}
}

/**
	hook 某个异步函数, 变为同步函数.
	此处只是返回了一个定义好的函数, 当它被执行时, __interface 才会被执行. 
	当 hook 一个库函数时, 需要处理一种情况: 返回的新函数又重新赋值给库函数, 而 __interface 中又会访问到它, 具体而言, 在 Converter 中会漏过把内置库函数变成 lib_path + exported_func_name 的形式, 进一步地导致后续失败.
	解决办法是此处先 convert 一下, 避免后续 convert 中与内置库比较. 
*/
function __hook(asyncFunc, timeoutMillsecs){
	let asyncInfo = {
		static_func: asyncFunc,
	};
	
	if(timeoutMillsecs){
		asyncInfo.timeout = timeoutMillsecs;
	}
		
	gloal_asyncfunc_converter.builtinAsyncFuncConvert(asyncInfo);	//先下手为强, 见上注释.
	return function(... params)
	{
		//console.info('-----------', asyncInfo);
		__interface(asyncInfo, ... params)
	};
}

function __interfaceForStaticFunc(asyncFunc, ... params){
	let asyncInfo = {
		static_func: asyncFunc,
	};
		
	gloal_asyncfunc_converter.builtinAsyncFuncConvert(asyncInfo);	//先下手为强, 见上注释.
	
	__interface(asyncInfo, ... params)
}

/*
	asyncInfo: {
		lib_path: 
		exported_func_name:
		
		static_func_source_str:	//static function: 没有引用其它函数, 也不是基于对象的调用.
		
		static_func: // static function
		
		refer_global_obj_stringified_strs: //引用的外部变量的 stringified list.
		
		timeout:	//最多等待的时间.
	}
	
*/
function __interface(asyncInfo, ...params){
	gloal_asyncfunc_converter.convert(asyncInfo);
	
	//console.info(asyncInfo);
	
	let callback = null;
	if(asyncInfo.callback_at_first){
		callback = params.shift();
	}else{
		callback = params.pop();
	}
	
	GetAsyncFuncInfo = function(){
		return asyncInfo;
	}
	GetArgs = function(){
		return params;
	}
	
	let asyncRes = null;
	let isException = false;
	let isCallbackAsync = false;
	let isTimeout = false;
	SetAsyncRes = function(res, isE, isA, isT){
		//console.info('----------', res, isE, isA, isT);
		asyncRes = res;
		isException = isE;
		isCallbackAsync = isA;
		isTimeout = isT;
	}
	
	let run = require(__filename).__implement;
	run(true);
	
	if(isException){
		throw asyncRes;
	}
	else if(isTimeout){
		let err = 'wait timeout ' + asyncInfo.timeout;
		throw err;
	}
	else if (isCallbackAsync){
		//异步函数已经在 async 调用里面触发过, 此处直接跳过即可.
		console.info(asyncRes);
	}
	else{
		//console.info('+++++++',asyncRes);
		if(!asyncRes){
			callback();
		}else{
			let resList = [];
			let i = 0;
			while(true){
				if(asyncRes.hasOwnProperty(i)){
					resList.push(asyncRes[i]);
					++ i;
				}
				else{
					break;
				}
			}
			callback(... resList);
		}
	}
}
