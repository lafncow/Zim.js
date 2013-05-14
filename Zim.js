;Zim = {
Model : function(data, options){

var options = options || {},
	data = (data === undefined) ? {} : data,
	defaultSetter = options.setter || function(val, cb){
		// minimum setter, callback must be fired
		cb && cb(val);
	},
	Meta = function(parent){
		this.children = {};
		this.subscribers = [];
		this.setter = defaultSetter;
		this.parent = parent;
	},
	metaData = new Meta(),
	Context = function(key){
		var baseKey = key,
			readKey = function(key){
				//readKey(string?) -> keyArray

				if( baseKey !== undefined ){
					var key = (key !== undefined) ? baseKey+'.'+key : baseKey;
				}

				return (key !== undefined) ? key.split('.') : [];
			},
			publishUp = function(key){
				// publishUp(string?) -> void

				var context = getContext(key),
					currentKey = context.key.pop(),
					datum = context.data,
					meta = context.meta;
				
				// Publish to subscribers
				for (var i in meta.subscribers) {
					meta.subscribers[i](datum);
				};

				// Recursively call publishUp on children
				for (var i in meta.children) {
					var childKey = (key === undefined) ? i : key+'.'+i;
					publishUp(childKey);
				};

				// If data is being un-set, delete the meta data
				if( datum === undefined && meta.parent){
					meta.parent.children[currentKey] = undefined;
				}
			},
			publishDown = function(key){
				// publishDown(string?) -> void

				var keyArray = readKey(key);

				// Publish to parents
				while( keyArray.length ){
					// skip current level, that is handled by publishUp
					keyArray.pop();
					var parentKey = keyArray.length ? keyArray.join('.') : undefined,
						context = getContext(parentKey, true),
						datum = context.data,
						meta = context.meta;
					for (var i in meta.subscribers) {
						meta.subscribers[i](datum);
					};
				}
			},
			writeValue = function(key, val){
				// writeValue(string?, val) -> void

				var key = readKey(key),
					datum = data;

				for( var i = 0, keyLen = key.length-1; i < keyLen; i+=1 ){
					if( datum[key[i]] === undefined ){
						datum[key[i]] = {};
					}
					datum = datum[key[i]];
				};

				if( key.length ){
					datum[key.pop()] = val;
				}else{
					datum = val;
				}
			},
			getContext = function(key, useAbsoluteKey){
				// getContext(key?) -> {data : data, meta : Meta, key : keyArray}
				var key = useAbsoluteKey ?  ((key !== undefined) ? key.split('.') : []) : readKey(key),
					datum = data,
					meta = metaData;

				for( var i = 0, keyLen = key.length; i < keyLen; i+=1 ){
					if( !meta.children[key[i]] ){
						meta.children[key[i]] = new Meta(meta);
					}
					meta = meta.children[key[i]];
					if( datum !== undefined ){
						datum = datum[key[i]];
					}
				};

				return {data : datum, meta : meta, key : key};
			},
			self = function(key){
				// Model(string?) -> Model
				
				var key = readKey(key);

				return new Context(key.length ? key.join('.') : undefined);
			};

		self.get = function(key){
			// Model.get(string?) -> data
			// NOT chainable!
			return getContext(key).data;
		};
		self.setEach = function(map, cb){
			// Model.setEach({key:value, ...}, func?) -> Model
			
			var meta = getContext().meta,
				keyCount = 0,
				decrementKeyCount = function(key){
					keyCount--;
					if( !keyCount ){
						// finally publishDown when all keys have set
						publishDown(key);
						cb && cb(getContext().data);
					}
				};
			
			for( var key in map ){
				keyCount += 1;
			};

			// Set values
			for( var key in map ){
				meta.children[key] = meta.children[key] || new Meta(meta);
				meta.children[key].setter(map[key], function(val){
					writeValue(key,val);
					publishUp(key);
					decrementKeyCount(key);
				});
			};

			return self;
		}
		self.set = function(key, val, cb){
			// Model.set(string?, obj, func?) -> Model

			// normalize arguments
			if( arguments.length === 2 && typeof(val) === 'function' ){
				var cb = val,
					val = key,
					key = undefined;
			}else if( arguments.length === 1 ){
				var val = key,
					key = undefined;
			}

			// Set value
			getContext(key).meta.setter(val, function(val){
					writeValue(key, val);
					self.pub(key);
					cb && cb(val);
				});

			return self;
		};
		self.pub = function(key, cb){
			// Model.pub(string?, func?) -> Model

			// normalize arguments
			if( arguments.length === 1 && typeof(key) === 'function' ){
				var cb = key,
					key = undefined;
			}

			// Publish
			publishUp(key);
			if( key !== undefined ){
				var parentKey = key.split('.');
				parentKey.pop();
				parentKey = parentKey.length ? parentKey.join('.') : undefined;
				publishDown(parentKey);
			}else{
				publishDown();
			}

			// Callback
			cb && cb(getContext(key).data);

			return self;
		};
		self.def = function(key, setter){
			// Model.def(string?, func) -> Model

			// normalize arguments
			if( arguments.length === 1 && typeof(key) === 'function' ){
				var setter = key,
					key = undefined;
			}

			getContext(key).meta.setter = setter || defaultSetter;

			return self;
		};
		self.del = function(key){
			// Model.del(string?) -> Model

			return self.set(key, undefined);
		};
		self.sub = function(key, subscriber){
			// Model.sub(string?, func) -> Model

			// normalize arguments
			if( arguments.length === 1 ){
				var subscriber = key,
					key = undefined;
			}

			// Subscribe
			getContext(key).meta.subscribers.push(subscriber);
			
			return self;
		};
		self.unsub = function(key, unsubscriber){
			// Model.unsub(string?, func) -> Model

			// normalize arguments
			if( arguments.length === 1 ){
				var unsubscriber = key,
					key = undefined;
			}

			// Unsubscribe
			var subscribers = getContext(key).meta.subscribers;
			for (var i=0, subsLen = subscribers.length; i < subsLen; i += 1) {
				if( subscribers[i] === unsubscriber ){
					subscribers.splice(i,1);
				}
			};

			return self;
		};
		self.find = self;

		// Model(string?) -> Model
		return self;
	};

return new Context();

},

renderer : function(template,data){
	// super basic & fallible template engine
	for( var i in data ){
		template = template.split('{{'+i+'}}').join(data[i]);
	};
	// remove unmatched template tags
	template.replace(/\{\{([^}]+?)\}\}/g,'');
	return template;
},

View : function(element,template,cb){
	
	// normalize arguments
	if( typeof(template) === 'function' ){
		cb = template;
		template = undefined;
	}

	var self = this,
		callBacks = cb ? [cb] : [];
	self.template = template || element.innerHTML || '';
	self.renderer = Zim.renderer;
	self.node = element || undefined;
	self.placeholder = template ? element.innerHTML : '';
	var context = self.node;
	self.find = typeof($)=='function' ? $ : function(selector){
		var firstChar = selector.substr(0,1);
		if( firstChar === '#' ){
			return document.getElementById(selector.substr(1));
		}else if( firstChar === '.' ){
			return context.getElementsByClassName(selector.substr(1));
		}else{
			return context.getElementsByTagName(selector);
		}
	};

	self.render = function(data){
		// View.render(data) -> string

		return self.renderer(self.template,data);
	};
	self.update = function(data,cb){
		// View.update(data, func?) -> View
		// optional callback applied in context of DOM, with data as argument

		if( data === undefined ){
			return self.del();
		}

		self.node.innerHTML = self.render(data);
		for( var i=0, ii=callBacks.length; i<ii; i++){
			callBacks[i].apply(self.node, [data]);
		}
		if( typeof(cb) === 'function' ){
			cb.apply(self.node, [data]);
		}

		return self;
	};
	self.reset = function(placeholder){
		// View.reset(string?) -> View
		if( placeholder !== undefined ){
			self.placeholder = placeholder;
		}
		self.node.innerHTML = self.placeholder;

		return self;
	};
	self.del = function(){
		// View.del() -> undefined
		self.reset();
		self.node = undefined;

		return undefined;
	};
	self.bind = function(event, func){
		// View.bind(string?, func) -> View

		// normalize arguments
		if( typeof(event) === 'function'){
			func = event;
			event = 'update';
		}

		if( event === 'update' ){
			handler = function(){func.apply(context);};
		}else{
			handler = function(){
				context.addEventListener(event,func);
			};
			handler.apply(context);
		}
		callBacks.push(handler);

		return self
	};

	return self;
}

};