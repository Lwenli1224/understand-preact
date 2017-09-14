/** Global options
 *	@public
 *	@namespace options {Object}
 */
// 这些都是留着扩展的
export default {

	/** If `true`, `prop` changes trigger synchronous component updates.
	 *	@name syncComponentUpdates
	 *	@type Boolean
	 *	@default true
	 */
	// 是否同步刷新组件
	//syncComponentUpdates: true,

	/** Processes all created VNodes.
	 *	@param {VNode} vnode	A newly-created VNode to normalize/process
	 *	用来扩展vNode
	 */
	//vnode(vnode) { }

	/** Hook invoked after a component is mounted. */
	// 在组件插入DOM时调用，不同于componentDidMount，它是专门给框架或组件内部使用，比如开发插件用 不对外暴露
	// afterMount(component) { }

	/** Hook invoked after the DOM is updated with a component's latest render. */
	// 在组件更新后时调用，不同于componentDidUpdate，它是专门给框架或组件内部使用，比如开发插件用 不对外暴露
	// afterUpdate(component) { }


	// 统一，卸载前用 内置的后门
	/** Hook invoked immediately before a component is unmounted. */
	// beforeUnmount(component) { }
};
