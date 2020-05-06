if(typeof(getRelativeLibPath) === 'undefined'){
	function getRelativeLibPath(relative){
		let curJs = __dirname+'/'
		let e = new RegExp('\\\\', 'g');
		curJs = curJs.replace(e, '/');
		return curJs + relative;
	}
}

const astUtils = require(getRelativeLibPath('./simple_ast_utils.js'));
const AstCombineWalkerEngine = require(getRelativeLibPath('./ast_combine_walker.js')).AstCombineWalkerEngine;

class FunctionWalker{
	constructor(){
		this.__params_names = [];
		this.__body_range = null;
	}
	
	onNode(node){
		if(node.type==='FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type==='FunctionDeclaration'){
			if(node.body){
				for(let p of node.params){
					this.__params_names.push(p.name);
				}
				
				this.__body_range = node.body.range;
			}
			
			//只遍历最外层的 function 定义.
			return true;
		}
	}
	
	getParamNames(){
		return this.__params_names;
	}
	
	getBodyRange(){
		return this.__body_range;
	}
}


function parseCodeToFunction(code){
	
	let resObj = astUtils.getAst(code);
	//__ast_errmsg, __ast, __ast_source_type
	if(!resObj.__ast){
		console.info('parse code to ast failed');
		return null;
	}
		
	let fw = new FunctionWalker();
	
	let wrapWalker = new AstCombineWalkerEngine(resObj.__ast, [fw], true);
	wrapWalker.doWalk();
	
	let paramNames = fw.getParamNames();
	let bodyRange = fw.getBodyRange();
	
	if(!bodyRange){
		console.info('bodyRange is null');
		return null;
	}
	
	let codeBodyCode = code.substring(bodyRange[0], bodyRange[1]);
	if(codeBodyCode[0]==='{' && codeBodyCode[codeBodyCode.length-1]==='}'){
		codeBodyCode = codeBodyCode.substring(1, codeBodyCode.length-1);
	}
	return new Function(... paramNames, codeBodyCode);
}

function log(str){
	const fs = require('fs');
	fs.writeFileSync('./debug.txt', str + '\n', {flag: 'a'});
}

function parseCodeToFunctionEval(code){
	log('============= in parse function');
	let resObj = astUtils.getAst(code);
	//__ast_errmsg, __ast, __ast_source_type
	if(!resObj.__ast){
		console.info('parse code to ast failed');
		return null;
	}
		
	let fw = new FunctionWalker();
	
	let wrapWalker = new AstCombineWalkerEngine(resObj.__ast, [fw], true);
	wrapWalker.doWalk();
	
	let paramNames = fw.getParamNames();
	let bodyRange = fw.getBodyRange();
	
	if(!bodyRange){
		console.info('bodyRange is null');
		return null;
	}
	
	let fname = '_' + Math.floor(Math.random()*10000000);
	let funcCode = 'function ' + fname + ' (' ;
	if(paramNames && paramNames.length>0){
		funcCode += paramNames.join(',');
	}
	funcCode += ') ' + code.substring(bodyRange[0], bodyRange[1]);
	funcCode += '; ' + fname;
	//console.info(funcCode);
	log('=============' + funcCode);
	return eval(funcCode);
}

function test(a, b){
	return a+b;
}

const fs = require('fs');
vx = 99;
function asyncFunction(){
	let k = 0;
	setTimeout(function(){
		console.info('i am edgarlli: ', vx, typeof(fs));
		//fs.writeFileSync('./debug.txt', 'i am edgarlli', {flag: 'a'});
	}, 1000);
	return 32;
}

//unitTest();
function unitTest(){
	eval('function say(){console.info( "kkk edgarlli");}');
	say();
	let f = parseCodeToFunctionEval(String(asyncFunction));
	console.info(typeof(f), f(9,98));
	
	f = parseCodeToFunctionEval('(a,b)=>{return a+b}');
	console.info(typeof(f), f(9,3));
}


module.exports = parseCodeToFunctionEval;
