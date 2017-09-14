/** Copy own-properties from `props` onto `obj`.
 *	@returns obj
 *	@private
 *  类似于Object.assign 
 */
export function extend(obj, props) {
	for (let i in props) obj[i] = props[i];
	return obj;
}

/** Call a function asynchronously, as soon as possible.
 *	@param {Function} callback
 *  异步，Promise立即resolve或者setTimeout 比如用来渲染
 */
export const defer = typeof Promise=='function' ? Promise.resolve().then.bind(Promise.resolve()) : setTimeout;
