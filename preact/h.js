import { VNode } from './vnode';
import options from './options';


const stack = [];

const EMPTY_CHILDREN = [];

/** JSX/hyperscript reviver
*	Benchmarks: https://esbench.com/bench/57ee8f8e330ab09900a1a1a0
 *	@see http://jasonformat.com/wtf-is-jsx
 *	@public
 *	其实就是类似于React.createElement，立即将children扁平化，
 *	并相邻的简单数据类型合并成一个字符串。因为在react的虚拟DOM体系中
 *	字符串相当于一个文本节点。减少children中的个数，就相当减少实际生成的文本节点的数量，也减少了以后diff的数量，能有效提高性能。
 *
 * nodeName相当于react的type
 * attributes相当于react的props
 * children相当于 props.children
 */
export function h(nodeName, attributes) {
	let children=EMPTY_CHILDREN, lastSimple, child, simple, i;
	for (i=arguments.length; i-- > 2; ) {
		// 2个参数以后的，认为是子元素，直接入栈children
		stack.push(arguments[i]);
	}
	if (attributes && attributes.children!=null) {
		// 如果有子元素，直接入栈children，相当于把属性结构扁平
		if (!stack.length) stack.push(attributes.children);
		delete attributes.children;
	}
	while (stack.length) {
		// 如果出站的元素还是个数组，遍历push
		// 
		if ((child = stack.pop()) && child.pop!==undefined) {
			for (i=child.length; i--; ) stack.push(child[i]);
		}
		else {
			// 布尔值 child为null
			if (typeof child==='boolean') child = null;
			// 如果是不是函数，就算是简单类型，多个进行合并，减少dom数量
			// 
			if ((simple = typeof nodeName!=='function')) {
				if (child==null) child = '';
				else if (typeof child==='number') child = String(child);
				else if (typeof child!=='string') simple = false;
			}

			if (simple && lastSimple) {
				children[children.length-1] += child;
			}
			else if (children===EMPTY_CHILDREN) {
				children = [child];
			}
			else {
				children.push(child);
			}

			lastSimple = simple;
		}
	}

	let p = new VNode();
	p.nodeName = nodeName;
	p.children = children;
	p.attributes = attributes==null ? undefined : attributes;
	p.key = attributes==null ? undefined : attributes.key;

	// if a "vnode hook" is defined, pass every created VNode to it
	if (options.vnode!==undefined) options.vnode(p);

	return p;
}
