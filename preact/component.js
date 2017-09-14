import { FORCE_RENDER } from './constants';
import { extend } from './util';
// 同步渲染
import { renderComponent } from './vdom/component';
// 异步渲染
import { enqueueRender } from './render-queue';

/** Base Component class.
 *	Provides `setState()` and `forceUpdate()`, which trigger rendering.
 *	@public
 *
 *	@example
 *	class MyFoo extends Component {
 *		render(props, state) {
 *			return <div />;
 *		}
 *	}
 */
export function Component(props, context) {
	// _dirty为true才能更新组件 vdom的时候可能会被修改为false 比如常量，就不会更新了
	// 
	this._dirty = true;

	/** @public
	 *	@type {object}
	 */
	// 全局context
	this.context = context;

	/** @public
	 *	@type {object}
	 */
	// 属性
	this.props = props;

	/** @public
	 *	@type {object}
	 */
	// 状态
	this.state = this.state || {};
}


extend(Component.prototype, {

	/** Returns a `boolean` indicating if the component should re-render when receiving the given `props` and `state`.
	 *	@param {object} nextProps
	 *	@param {object} nextState
	 *	@param {object} nextContext
	 *	@returns {Boolean} should the component re-render
	 *	@name shouldComponentUpdate
	 *	@function
	 */


	/** Update component state by copying properties from `state` to `this.state`.
	 *	@param {object} state		A hash of state properties to update with new values
	 *	@param {function} callback	A function to be called once component state is updated
	 */
	// 直接合并state，不是新的state，不存在不可变的state了
	setState(state, callback) {
		let s = this.state;
		if (!this.prevState) this.prevState = extend({}, s);
		extend(s, typeof state==='function' ? state(s, this.props) : state);
		// 如果有回调，放入_renderCallbacks，vdom的时候会判断执行
		if (callback) (this._renderCallbacks = (this._renderCallbacks || [])).push(callback);
		// 异步刷新组件
		enqueueRender(this);
	},


	/** Immediately perform a synchronous re-render of the component.
	 *	@param {function} callback		A function to be called after component is re-rendered.
	 *	@private
	 */
	// 强制刷新组件，同步的 
	forceUpdate(callback) {
		// 如果有回调，放入_renderCallbacks，vdom的时候会判断执行		
		if (callback) (this._renderCallbacks = (this._renderCallbacks || [])).push(callback);
		// 同步刷新组件
		renderComponent(this, FORCE_RENDER);
	},


	/** Accepts `props` and `state`, and returns a new Virtual DOM tree to build.
	 *	Virtual DOM is generally constructed via [JSX](http://jasonformat.com/wtf-is-jsx).
	 *	@param {object} props		Props (eg: JSX attributes) received from parent element/component
	 *	@param {object} state		The component's current state
	 *	@param {object} context		Context object (if a parent component has provided context)
	 *	@returns VNode
	 */
	render() {}

});
