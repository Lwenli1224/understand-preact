import { ATTR_KEY } from '../constants';
import { isSameNodeType, isNamedNode } from './index';
import { buildComponentFromVNode } from './component';
import { createNode, setAccessor } from '../dom/index';
import { unmountComponent } from './component';
import options from '../options';
import { removeNode } from '../dom/index';

/** Queue of components that have been mounted and are awaiting componentDidMount */
//用于收集那些等待被调用componentDidMount回调的组件
export const mounts = [];

/** Diff recursion count, used to track the end of the diff cycle. */
// 递归的层级
export let diffLevel = 0;

/** Global flag indicating if the diff is currently within an SVG */
let isSvgMode = false;

/** Global flag indicating if the diff is performing hydration */
// 是不是已经缓存了之前的虚拟Dom的数据
let hydrating = false;

/** Invoke queued componentDidMount lifecycle methods */
// 批量触发afterMount(内部用)和componentDidMount
export function flushMounts() {
	let c;
	while ((c=mounts.pop())) {
		if (options.afterMount) options.afterMount(c);
		if (c.componentDidMount) c.componentDidMount();
	}
}


/** Apply differences in a given vnode (and it's deep children) to a real DOM Node.
 *	@param {Element} [dom=null]		A DOM node to mutate into the shape of the `vnode`
 *	@param {VNode} vnode			A VNode (with descendants forming a tree) representing the desired DOM structure
 *	@returns {Element} dom			The created/mutated element
 *	@private
 */

// 一般用户 diff(undefined, vnode, {}, false, parent, false);
export function diff(dom, vnode, context, mountAll, parent, componentRoot) {
	// diffLevel having been 0 here indicates initial entry into the diff (not a subdiff)
	if (!diffLevel++) {
		// when first starting the diff, check if we're diffing an SVG or within an SVG
		// 为什么还要判断dom是不是SVG
		isSvgMode = parent!=null && parent.ownerSVGElement!==undefined;
		// 判断是否缓存了数据
		// hydration is indicated by the existing element to be diffed not having a prop cache
		hydrating = dom!=null && !(ATTR_KEY in dom);
	}
	// 获取diff的结果，更新dom，或者返回新的dom
	let ret = idiff(dom, vnode, context, mountAll, componentRoot);

	// append the element if its a new parent
	// 插入父节点
	if (parent && ret.parentNode!==parent) parent.appendChild(ret);

	// diffLevel being reduced to 0 means we're exiting the diff
	// 如果递归深度编程0了，终止，执行flushMounts，也就是执行所有的afterMount和componentDidMount钩子
	if (!--diffLevel) {
		hydrating = false;
		// invoke queued componentDidMount lifecycle methods
		if (!componentRoot) flushMounts();
	}

	return ret;
}



// idiff的逻辑可分成这几步

// 保存现有的文档为型
// 更新或创建文本节点
// 更新或创建组件对应的真实DOM
// 更新普通元素节点
// 收集元素当前的真实属性
// 更新元素的内部（孩子）
// diff元素的属性
// 还原之前的文档类型
// 而更外围的diff方法，主要通过diffLevel这个变量，控制所有插入组件的DidMount钩子的调用。
// idiff内部有一个叫innerDiffNode的方法，如果是我作主，我更愿意命名为diffChildren.
// innerDiffNode方法是非常长，好像每次我阅读它，它都变长一点。一点点猴子补丁往上加，完全不考虑用设计模式对它进行拆分

/** Internals of `diff()`, separated to allow bypassing diffLevel / mount flushing. */
function idiff(dom, vnode, context, mountAll, componentRoot) {
	let out = dom,
		prevSvgMode = isSvgMode;
	// 转换(null, undefined, booleans) 为字符串
	// empty values (null, undefined, booleans) render as empty Text nodes
	if (vnode==null || typeof vnode==='boolean') vnode = '';

	// Fast case: Strings & Numbers create/update Text nodes.
	if (typeof vnode==='string' || typeof vnode==='number') {

		// update if it's already a Text node:
		// dom存在，并且通过判断.splitText是文本节点
		if (dom && dom.splitText!==undefined && dom.parentNode && (!dom._component || componentRoot)) {
			/* istanbul ignore if */ /* Browser quirk that can't be covered: https://github.com/developit/preact/commit/fd4f21f5c45dfd75151bd27b4c217d8003aa5eb9 */
			if (dom.nodeValue!=vnode) {
				dom.nodeValue = vnode;
			}
		}
		else {
			// dom不存在，新建一下
			// it wasn't a Text node: replace it with one and recycle the old Element
			out = document.createTextNode(vnode);
			if (dom) {
				if (dom.parentNode) dom.parentNode.replaceChild(out, dom);
				recollectNodeTree(dom, true);
			}
		}

		out[ATTR_KEY] = true;

		return out;
	}

	// 如果是组件
	// If the VNode represents a Component, perform a component diff:
	let vnodeName = vnode.nodeName;
	if (typeof vnodeName==='function') {
		return buildComponentFromVNode(dom, vnode, context, mountAll);
	}


	// Tracks entering and exiting SVG namespace when descending through the tree.
	isSvgMode = vnodeName==='svg' ? true : vnodeName==='foreignObject' ? false : isSvgMode;


	// If there's no existing element or it's the wrong type, create a new one:
	vnodeName = String(vnodeName);
	// 如果dom不存在，或者标签类型不同
	if (!dom || !isNamedNode(dom, vnodeName)) {
		// 此件Dom
		out = createNode(vnodeName, isSvgMode);

		if (dom) {
			// move children into the replacement node
			// 转移真实dom
			while (dom.firstChild) out.appendChild(dom.firstChild);

			// if the previous Element was mounted into the DOM, replace it inline
			// 插入父节点
			if (dom.parentNode) dom.parentNode.replaceChild(out, dom);

			// recycle the old element (skips non-Element node types)
			recollectNodeTree(dom, true);
		}
	}


	let fc = out.firstChild,
		// 获取之前的虚拟DOM的props
		props = out[ATTR_KEY],
		vchildren = vnode.children;

	if (props==null) {
		props = out[ATTR_KEY] = {};
		// 吧attributes转换为props??
		for (let a=out.attributes, i=a.length; i--; ) props[a[i].name] = a[i].value;
	}
	// 如果当前是真是DOM是文本节点，并且没有缓存数据，则虚拟DOM是一个字符串，直接修改nodeValue
	// Optimization: fast-path for elements containing a single TextNode:
	if (!hydrating && vchildren && vchildren.length===1 && typeof vchildren[0]==='string' && fc!=null && fc.splitText!==undefined && fc.nextSibling==null) {
		if (fc.nodeValue!=vchildren[0]) {
			fc.nodeValue = vchildren[0];
		}
	}
	// otherwise, if there are existing or new children, diff them:
	else if (vchildren && vchildren.length || fc!=null) {
		更新Dom的子元素
		innerDiffNode(out, vchildren, context, mountAll, hydrating || props.dangerouslySetInnerHTML!=null);
	}
	// 更新DOM属性

	// Apply attributes/props from VNode to the DOM Element:
	diffAttributes(out, vnode.attributes, props);


	// restore previous SVG mode: (in case we're exiting an SVG namespace)
	isSvgMode = prevSvgMode;

	return out;
}


/** Apply child and attribute changes between a VNode and a DOM Node to the DOM.
 *	@param {Element} dom			Element whose children should be compared & mutated
 *	@param {Array} vchildren		Array of VNodes to compare to `dom.childNodes`
 *	@param {Object} context			Implicitly descendant context object (from most recent `getChildContext()`)
 *	@param {Boolean} mountAll
 *	@param {Boolean} isHydrating	If `true`, consumes externally created elements similar to hydration
 */
function innerDiffNode(dom, vchildren, context, mountAll, isHydrating) {
	let originalChildren = dom.childNodes,
		children = [],
		keyed = {},
		keyedLen = 0,
		min = 0,
		len = originalChildren.length,
		childrenLen = 0,
		vlen = vchildren ? vchildren.length : 0,
		j, c, f, vchild, child;

	// Build up a map of keyed children and an Array of unkeyed children:
    // 如果真实DOM 存在孩子，可以进行diff，这时要收集设置到key属性的孩子到keyed对象，剩余的则放在children数组中
    if (len!==0) {
		for (let i=0; i<len; i++) {
			let child = originalChildren[i],
				props = child[ATTR_KEY],
				key = vlen && props ? child._component ? child._component.__key : props.key : null;
			if (key!=null) {
				keyedLen++;
				keyed[key] = child;
			}
			else if (props || (child.splitText!==undefined ? (isHydrating ? child.nodeValue.trim() : true) : isHydrating)) {
				children[childrenLen++] = child;
			}
		}
	}

	if (vlen!==0) {
		for (let i=0; i<vlen; i++) {
			vchild = vchildren[i];
			child = null;

			// attempt to find a node based on key matching
			// // 先尝试根据key来寻找已有的DOM
			let key = vchild.key;
			if (key!=null) {
				if (keyedLen && keyed[key]!==undefined) {
					child = keyed[key];
					keyed[key] = undefined;
					keyedLen--;
				}
			}
			// attempt to pluck a node of the same type from the existing children
			// 如果没有key ,那么就根据nodeName来寻找最近的那个节点
			else if (!child && min<childrenLen) {
				for (j=min; j<childrenLen; j++) {
					if (children[j]!==undefined && isSameNodeType(c = children[j], vchild, isHydrating)) {
						child = c;
						children[j] = undefined;
						if (j===childrenLen-1) childrenLen--;
						if (j===min) min++;
						break;
					}
				}
			}

			// morph the matched/found/created DOM child to match vchild (deep)
			child = idiff(child, vchild, context, mountAll);

			f = originalChildren[i];
			if (child && child!==dom && child!==f) {
				if (f==null) {
					dom.appendChild(child);
				}
				else if (child===f.nextSibling) {
					removeNode(f);
				}
				else {
					dom.insertBefore(child, f);
				}
			}
		}
	}


	// remove unused keyed children:
	if (keyedLen) {
		for (let i in keyed) if (keyed[i]!==undefined) recollectNodeTree(keyed[i], false);
	}

	// remove orphaned unkeyed children:
	while (min<=childrenLen) {
		if ((child = children[childrenLen--])!==undefined) recollectNodeTree(child, false);
	}
}



/** Recursively recycle (or just unmount) a node and its descendants.
 *	@param {Node} node						DOM node to start unmount/removal from
 *	@param {Boolean} [unmountOnly=false]	If `true`, only triggers unmount lifecycle, skips removal
 */
//recollectNodeTree用于移除组件与执行元素节点的缓存数据

export function recollectNodeTree(node, unmountOnly) {
	let component = node._component;
	if (component) {
		// if node is owned by a Component, unmount that component (ends up recursing back here)
		unmountComponent(component);
	}
	else {
		// If the node's VNode had a ref function, invoke it with null here.
		// (this is part of the React spec, and smart for unsetting references)
		if (node[ATTR_KEY]!=null && node[ATTR_KEY].ref) node[ATTR_KEY].ref(null);

		if (unmountOnly===false || node[ATTR_KEY]==null) {
			removeNode(node);
		}

		removeChildren(node);
	}
}


/** Recollect/unmount all children.
 *	- we use .lastChild here because it causes less reflow than .firstChild
 *	- it's also cheaper than accessing the .childNodes Live NodeList
 */
export function removeChildren(node) {
	node = node.lastChild;
	while (node) {
		let next = node.previousSibling;
		recollectNodeTree(node, true);
		node = next;
	}
}


/** Apply differences in attributes from a VNode to the given DOM Element.
 *	@param {Element} dom		Element with attributes to diff `attrs` against
 *	@param {Object} attrs		The desired end-state key-value attribute pairs
 *	@param {Object} old			Current/previous attributes (from previous VNode or element's prop cache)
 */
function diffAttributes(dom, attrs, old) {
	let name;

	// remove attributes no longer present on the vnode by setting them to undefined
	for (name in old) {
		if (!(attrs && attrs[name]!=null) && old[name]!=null) {
			setAccessor(dom, name, old[name], old[name] = undefined, isSvgMode);
		}
	}

	// add new & update changed attributes
	for (name in attrs) {
		if (name!=='children' && name!=='innerHTML' && (!(name in old) || attrs[name]!==(name==='value' || name==='checked' ? dom[name] : old[name]))) {
			setAccessor(dom, name, old[name], old[name] = attrs[name], isSvgMode);
		}
	}
}
