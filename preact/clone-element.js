import { extend } from './util';
import { h } from './h';

// cloneElement基于h实现 复制一份属性，然后h(createElememtn)以下
// 

export function cloneElement(vnode, props) {
	return h(
		vnode.nodeName,
		extend(extend({}, vnode.attributes), props),
		arguments.length>2 ? [].slice.call(arguments, 2) : vnode.children
	);
}
