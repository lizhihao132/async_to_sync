const __up_pointer_name = '__up_pointer';

class AbstractWalkerEngine{
	constructor(ignoreAttrSet){
		this.ignoreAttrSet = ignoreAttrSet?ignoreAttrSet: new Set();
		this.ignoreAttrSet.add(__up_pointer_name);
	}

	addParentPoint(ast){
		var dealedObj = new Set();
		let noNeedAddParentFor = new Set(['range', 'loc', '__proto__', 'through', 'variableScope', 'childScopes', 'implicit', 'variables', 'references','tokens']);
		noNeedAddParentFor.add(__up_pointer_name);
		let callback = function(node, parent, attr){
			if(!node || 'object' !== typeof(node)){
				return;
			}

			if(noNeedAddParentFor.has(attr)){
				return;
			}

			node[__up_pointer_name] = parent;
		};
		
		this.__walk(ast, null, callback, dealedObj);
		dealedObj.clear();
		dealedObj = null;
		return ast;
	}
	
	walk(obj, callback){
		var dealedObj = new Set();
		let parentObj = obj[__up_pointer_name];
		this.__walk(obj, parentObj, callback, dealedObj);
		dealedObj.clear();
		dealedObj = null;
		return obj;
	}
	
	__getAttrsOfObj(obj){
		if(!obj) return 'obj is null;'
		let str = '';
		for(let a in obj){
			str += a + ',';
		}
		return str;
	}
	
	__walk(obj, parentObj, callback, dealedObj, ofAttr){
		if(!obj){
			return;
		}

		//console.info(ofAttr, parentObj===obj? "parentObj is same with obj":"", this.__getAttrsOfObj(obj), this.__getAttrsOfObj(parentObj));
		/*
		if(dealedObj.has(obj)) 
			return;
		dealedObj.add(obj);
		*/

		let toStop = callback(obj, parentObj, ofAttr);
		
		if(toStop){
			return;
		}

		for(var attr in obj){
			if(this.ignoreAttrSet && this.ignoreAttrSet.has(attr)){
				continue;
			}
			
			var subObj = obj[attr];
			if(!subObj || 'object' !== typeof(subObj)) {
				continue;
			}

			this.__walk(subObj, obj, callback, dealedObj, attr);
		}
	}
};

class AstSingleWalkerEngine{
	constructor(walkerImplement, ignoreSet){
		this.__walker_implement = walkerImplement;
		this.__engine = new AbstractWalkerEngine(ignoreSet);
	}
	walk(ast){
		let walkerImplement = this.__walker_implement;
		this.__engine.walk(ast, function(node, parentObj, ofAttr){
			return walkerImplement.onNode(node, parentObj, ofAttr);
		});
	}
}

class AstCombineWalkerEngine{
	constructor(ast, walkerList, noNeedAddParent){
		this.__fastWalker = new AbstractWalkerEngine();
		if(!noNeedAddParent){
			ast = this.__fastWalker.addParentPoint(ast);
		}

		this.__walker_list = walkerList;
		this.__ast = ast;
	}

	doWalk(){
		let walkerList = this.__walker_list;
		for(let w of walkerList){
			let callback = function(node, parent, attr){
				return w.onNode(node, parent, attr);
			};
			this.__fastWalker.walk(this.__ast, callback);
		}
	}
}

module.exports = {
	AstCombineWalkerEngine: AstCombineWalkerEngine,
	AstSingleWalkerEngine: AstSingleWalkerEngine,
	up_pointer_name: __up_pointer_name,
}
