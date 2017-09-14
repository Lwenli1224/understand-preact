import { SYNC_RENDER, NO_RENDER, FORCE_RENDER, ASYNC_RENDER, ATTR_KEY } from '../constants';
import options from '../options';
import { extend } from '../util';
import { enqueueRender } from '../render-queue';
import { getNodeProps } from './index';
import { diff, mounts, diffLevel, flushMounts, recollectNodeTree, removeChildren } from './diff';
import { createComponent, collectComponent } from './component-recycler';
import { removeNode } from '../dom/index';






/** Set a component's `props` (generally derived from JSX attributes).
 *	@param {Object} props
 *	@param {Object} [opts]
 *	@param {boolean} [opts.renderSync=false]	If `true` and {@link options.syncComponentUpdates} is `true`, triggers synchronous rendering.
 *	@param {boolean} [opts.render=true]			If `false`, no render will be triggered.
 */
export function setComponentProps(component, props, opts, context, mountAll) {
	// 开始后设置disable为true 阻止其他更新
	if (component._disable) return;
	component._disable = true;


	if ((component.__ref = props.ref)) delete props.ref;
	if ((component.__key = props.key)) delete props.key;

	if (!component.base || mountAll) {
		//如果没有插入到DOM树或正在被ReactDOM.render渲染
		if (component.componentWillMount) component.componentWillMount();
	}
	else if (component.componentWillReceiveProps) {
		// 更新ing
		component.componentWillReceiveProps(props, context);
	}
	//下面依次设置provProps, props, prevContext, context
	if (context && context!==component.context) {
		if (!component.prevContext) component.prevContext = component.context;
		component.context = context;
	}

	if (!component.prevProps) component.prevProps = component.props;
	component.props = props;

	component._disable = false;

	if (opts!==NO_RENDER) {
		if (opts===SYNC_RENDER || options.syncComponentUpdates!==false || !component.base) {
			// 同步
			renderComponent(component, SYNC_RENDER, mountAll);
		}
		else {
			// 异步
			enqueueRender(component);
		}
	}

	if (component.__ref) component.__ref(component);
}



/** Render a Component, triggering necessary lifecycle events and taking High-Order Components into account.
 *	@param {Component} component
 *	@param {Object} [opts]
 *	@param {boolean} [opts.build=false]		If `true`, component will build and store a DOM node if not already associated with one.
 *	@private
 */
// 同步渲染模板
// 我们需要知道，组件render后可能产生普通虚拟DOM与子组件
// 而只有普通虚拟DOM才能转化为真实DOM。
// 组件的实例通过_component与_parentComponent联结在一块，
// 方便上下回溯。而实例总是保存着最后转化出来的真实DOM（base, 也叫initialBase）。
// base上保存着最上面的那个组件实例，也就是_component，此外，为了方便比较，它的构造器也放在DOM节点上。

// renderComponent(componentInstance, renderModel, isRenderByReactDOM, isRenderChildComponent)
export function renderComponent(component, opts, mountAll, isChild) {
	// 如果disable了，直接返回
	if (component._disable) return;
    //开始取出它前后的props, state,context, base，以及之前的状态
    //base是这个组件的render方法生成的虚拟DOM最后转化出来的真实DOM
    //如果有这个真实DOM，说明它已经mount了，现在是处于更新状态
	let props = component.props,
		state = component.state,
		context = component.context,
		previousProps = component.prevProps || props,
		previousState = component.prevState || state,
		previousContext = component.prevContext || context,
		isUpdate = component.base,
		nextBase = component.nextBase,
		//真实DOM
		initialBase = isUpdate || nextBase,
		// 这个变早比较难理
		// 它是component的render方法生成的虚拟DOM的type函数再实例化出来的子组件
		// 相当于一个组件又return出另一个组件。
		// 通常情况下，组件会return出来的虚拟DOM的type为一个字符串，对应div, p, span这些真实存在的nodeName
		// 而type为函数时，它就是一个组件。
		initialChildComponent = component._component,
		skip = false,
		rendered, inst, cbase;

	// if updating
	// 如果是更新状态，会经过shouldComponentUpdate，componentWillUpdate钩子
	if (isUpdate) {
		component.props = previousProps;
		component.state = previousState;
		component.context = previousContext;
		if (opts!==FORCE_RENDER
			&& component.shouldComponentUpdate
			&& component.shouldComponentUpdate(props, state, context) === false) {
			skip = true;
		}
		else if (component.componentWillUpdate) {
			component.componentWillUpdate(props, state, context);
		}
		component.props = props;
		component.state = state;
		component.context = context;
	}

	component.prevProps = component.prevState = component.prevContext = component.nextBase = null;
	component._dirty = false;

	if (!skip) {
		// 调用渲染函数 获取渲染的实例
		rendered = component.render(props, state, context);

		// context to pass to the child, can be updated via (grand-)parent component
		// 如果有getChildContext 设置context
		if (component.getChildContext) {
			context = extend(extend({}, context), component.getChildContext());
		}

		let childComponent = rendered && rendered.nodeName,
			toUnmount, base;

		//判定render出来的虚拟DOM是否还是一个组件，function说明依然是组件 否则就是dom
		if (typeof childComponent==='function') {
			// set up high order component link
			// 或许子props 混合attributes，children和defaultProps
			let childProps = getNodeProps(rendered);
			inst = initialChildComponent;
			// 如果key相同， 说明只需要更新props即可
			if (inst && inst.constructor===childComponent && childProps.key==inst.__key) {
				setComponentProps(inst, childProps, SYNC_RENDER, context, false);
			}
			// 否则要替换组件
			else {
				toUnmount = inst;

				component._component = inst = createComponent(childComponent, childProps, context);
				inst.nextBase = inst.nextBase || nextBase;
				inst._parentComponent = component;
				setComponentProps(inst, childProps, NO_RENDER, context, false);
				renderComponent(inst, SYNC_RENDER, mountAll, true);
			}

			base = inst.base;
		}
		else {
			// 不是组件 是虚拟dom
			cbase = initialBase;

			// destroy high order component link
			toUnmount = initialChildComponent;
			if (toUnmount) {
				cbase = component._component = null;
			}

			if (initialBase || opts===SYNC_RENDER) {
				if (cbase) cbase._component = null;
				base = diff(cbase, rendered, context, mountAll || !isUpdate, initialBase && initialBase.parentNode, true);
			}
		}
		// 如果元素节点不同，并且组件实例也不是一个 替换
		if (initialBase && base!==initialBase && inst!==initialChildComponent) {
			let baseParent = initialBase.parentNode;
			if (baseParent && base!==baseParent) {
				baseParent.replaceChild(base, initialBase);

				if (!toUnmount) {
					initialBase._component = null;
					recollectNodeTree(initialBase, false);
				}
			}
		}

		if (toUnmount) {
			unmountComponent(toUnmount);
		}
		//重写真实DOM
		component.base = base;
		if (base && !isChild) {
			let componentRef = component,
				t = component;
			// 由于组件能返回组件
			// 可能经过N次render后才能返回一个能转换成为真实DOM的普通虚拟DOM
			// 这些组件通过_parentComponent链接在一起，它们都是共享同一个真实DOM（base）
			// 这时我们需要为这些组件都重写base属性
			while ((t=t._parentComponent)) {
				(componentRef = t).base = base;
			}
			//在真实DOM上保存最初的那个组件与组件的构造器
            //在真实DOM上保存这么多对象其实是不太好的实现，因为会导致内存泄露，因此才有了recollectNodeTree这个方法
            base._component = componentRef;
   			base._componentConstructor = componentRef.constructor;
		}
	}

	//如果是异步插入进行组件的单个render或者是ReactDOM.render，这些组件实例都会先放到mounts数组中。
    if (!isUpdate || mountAll) {
        mounts.unshift(component);
    }
	else if (!skip) {
		// Ensure that pending componentDidMount() hooks of child components
		// are called before the componentDidUpdate() hook in the parent.
		// Note: disabled as it causes duplicate hooks, see https://github.com/developit/preact/issues/750
		// flushMounts();
		//更新完毕，调用componentDidUpdate，afterUpdate钩子
		if (component.componentDidUpdate) {
			component.componentDidUpdate(previousProps, previousState, previousContext);
		}
		if (options.afterUpdate) options.afterUpdate(component);
	}
	//调用setState, forceUpdate钩子
	if (component._renderCallbacks!=null) {
		while (component._renderCallbacks.length) component._renderCallbacks.pop().call(component);
	}
	//执行其他组件的更新或插入，diffLevel为一个全局变量
	if (!diffLevel && !isChild) flushMounts();
}



/** Apply the Component referenced by a VNode to the DOM.
 *	@param {Element} dom	The DOM node to mutate
 *	@param {VNode} vnode	A Component-referencing VNode
 *	@returns {Element} dom	The created/mutated element
 *	@private
 *	相当于updateComponent
 */
export function buildComponentFromVNode(dom, vnode, context, mountAll) {
	// 取得真是DOM上的组件实例
	let c = dom && dom._component,
		originalComponent = c,
		oldDom = dom,
		//判定两个构造器是否相等
		isDirectOwner = c && dom._componentConstructor===vnode.nodeName,
		isOwner = isDirectOwner,
		// 添加默认属性
		props = getNodeProps(vnode);
		// 寻找与之前同类型的组件
	while (c && !isOwner && (c=c._parentComponent)) {
		isOwner = c.constructor===vnode.nodeName;
	}
	// 如果找到了，并且并不是render执行过程中
	if (c && isOwner && (!mountAll || c._component)) {
		setComponentProps(c, props, ASYNC_RENDER, context, mountAll);
		dom = c.base;
	}
	else {
		// 移除旧的，创建新的
		if (originalComponent && !isDirectOwner) {
			unmountComponent(originalComponent);
			dom = oldDom = null;
		}

		c = createComponent(vnode.nodeName, props, context);
		if (dom && !c.nextBase) {
			c.nextBase = dom;
			// passing dom/oldDom as nextBase will recycle it if unused, so bypass recycling on L229:
			oldDom = null;
		}
		setComponentProps(c, props, SYNC_RENDER, context, mountAll);
		dom = c.base;

		if (oldDom && dom!==oldDom) {
			oldDom._component = null;
			recollectNodeTree(oldDom, false);
		}
	}

	return dom;
}



/** Remove a component from the DOM and recycle it.
 *	@param {Component} component	The Component instance to unmount
 *	@private
 *	卸载组件 递归
 */
export function unmountComponent(component) {
	if (options.beforeUnmount) options.beforeUnmount(component);

	let base = component.base;

	component._disable = true;

	if (component.componentWillUnmount) component.componentWillUnmount();

	component.base = null;

	// recursively tear down & recollect high-order component children:
	let inner = component._component;
	if (inner) {
		unmountComponent(inner);
	}
	else if (base) {
		if (base[ATTR_KEY] && base[ATTR_KEY].ref) base[ATTR_KEY].ref(null);

		component.nextBase = base;

		removeNode(base);
		collectComponent(component);

		removeChildren(base);
	}

	if (component.__ref) component.__ref(null);
}
