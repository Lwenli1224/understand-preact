// render modes


// 渲染模式
// 
// 不渲染
export const NO_RENDER = 0;
// 同步渲染，比如React.render
export const SYNC_RENDER = 1;
// forceUpdate，强制更新
export const FORCE_RENDER = 2;
// setState更新，就是异步更新组件
export const ASYNC_RENDER = 3;

// preact标记的属性
export const ATTR_KEY = '__preactattr_';

// 识别不需要添加px单位的样式
// DOM properties that should NOT have "px" added when numeric
export const IS_NON_DIMENSIONAL = /acit|ex(?:s|g|n|p|$)|rph|ows|mnc|ntw|ine[ch]|zoo|^ord/i;

