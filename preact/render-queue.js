import options from './options';
import { defer } from './util';
import { renderComponent } from './vdom/component';

/** Managed queue of dirty components to be re-rendered */

let items = [];

// 延迟渲染当前组件（setState） 第一次申请异步的时候，启动异步任务
export function enqueueRender(component) {
	if (!component._dirty && (component._dirty = true) && items.push(component)==1) {
		(options.debounceRendering || defer)(rerender);
	}
}

export function rerender() {
	let p, list = items;
    // 清空items 然后挨个执行 渲染组件
	items = [];
	while ( (p = list.pop()) ) {
		if (p._dirty) renderComponent(p);
	}
}
