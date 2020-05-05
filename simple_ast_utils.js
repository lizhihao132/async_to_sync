const esprima = require('esprima');
const acorn = require('acorn');

class Utils{

	getAst(code)
	{
		let esprimaLaoption = {range: true, loc: false, tokens: false, jsx: false, tolerant: true, comment: false, };
		let acornOption = {ranges: true, locations: false, ecmaVersion: 6, sourceType: "module", allowReserved: true, };
		
		let e_ast = null;
		let errmsg;
		let sourceType;
		
		if(!e_ast)
		try{
			e_ast=esprima.parseModule(code, esprimaLaoption );
			sourceType = 'module';
		}catch(err){errmsg=err;}
		
		if(!e_ast)
			try{
				e_ast=esprima.parseScript(code, esprimaLaoption);
				sourceType = 'script';
			}catch(err){errmsg=err;}
		
		if(!e_ast)
		{		
			try{
				e_ast = acorn.parse(code, acornOption);
				sourceType = 'module';
			}catch(err){
				try{
					e_ast = acorn.parse(code, acornOption);
					sourceType = 'script';
				}
				catch(err){
					try{
						e_ast = acorn.parse(code, {ranges: true})	//对于这样的代码在高版本的 js 中是有效的: a = {name: 1}; b={hei:3}; c={...a,...b};
					}catch(err){
						errmsg=err;
					}
				}
			}
		}
		
		let retObj = {};

		if(!e_ast){
			retObj.__ast_errmsg = errmsg;
			console.info(errmsg);
			return retObj;
		}
		
		retObj.__ast = e_ast;
		retObj.__ast_source_type = sourceType;

		return retObj;
	}
}
const global_utils = new Utils();

module.exports = global_utils;