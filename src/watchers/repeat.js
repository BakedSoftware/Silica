goog.module('watchers.repeat')
// Import browser hax
const Hax = goog.require('hax')
const ControllerCompiler = goog.require('compilers.controller')
const Model = goog.require('compilers.model')

function Repeat () {
  var changed, child, context, ctx, list, model, newList, newListHash, obj, oldList, repeat, template, _i, _len, _ref, raw
  var elements = Silica.querySorted(this, '[data-repeat]')
  for (let i = 0, length = elements.length; i < length; ++i) {
    raw = elements[i]
    repeat = raw.dataset['repeat'].split(/\s+in\s+/)
    list = repeat[1]
    model = repeat[0]
    ctx = Silica.getContext(raw)
    let possiblyNested = !raw.dataset['repeatNotNested']

    // Check if we are calling a function with a param
    if (typeof (_ref = list.match(/((?:\w|\.)+)(?:\(([\w\.]+)\))*/))[2] !== 'undefined') {
      let param = _ref[2]
      param = Silica.getValue(raw.parentNode, param)

      newList = Silica.getValue(raw, _ref[1], null, param)
    } else {
      newList = Silica.getValue(raw, list)
    }

    let existing = raw.childNodes

    if (!newList) {
      while (raw.childNodes.length > 0) {
        Silica.removeFromDOM(raw.childNodes[0])
      }
      continue
    }

    // Add support for iterating X times
    if (newList.constructor === Number) {
      newList = new Array(newList)
    }

    // Get the template
    template = Silica._repeat_templates[Hax.getDatasetProperty(raw, 'siO2TemplateId')]
    if (newList.constructor === Object) {
      let keys = Object.keys(newList)
      let obj = newList
      newList = []
      for (let j = 0, len = keys.length, key = keys[j]; j < len; j++) {
        key = keys[j]
        newList[j] = { key: key, value: obj[key] }
      }
    }

    let countDiff = raw.childElementCount - newList.length
    let node

    while (countDiff > 0) {
      Silica.removeFromDOM(existing[countDiff - 1])
      --countDiff
    }

    let fragment = document.createDocumentFragment()

    while (countDiff < 0) {
      context = {}
      context[model] = newList[newList.length + countDiff]
      context.$ctrl = ctx
      child = template.cloneNode(true)
      child._rt_ctx = context
      for (let key in Silica.compilers) {
        Silica.compilers[key].call(child)
      }
      fragment.appendChild(child)
      ++countDiff
    }
    if (fragment.hasChildNodes()) {
      raw.appendChild(fragment)
    }

    for (_i = 0, _len = newList.length; _i < _len; _i++) {
      obj = newList[_i]
      node = existing[_i]
      let modelChanged = model !== obj
      if (node._rt_ctx) {
        node._rt_ctx[model] = obj
      } else {
        context = {}
        context[model] = obj
        context.$ctrl = ctx
        node._rt_ctx = context
      }
      // Rebuild controllers if the model changed
      if (modelChanged) {
        ControllerCompiler.call(node, node._rt_ctx, true)
      }
      node._rt_ctx.index = _i

      // Silica.flush(node, false, {}, true)
      if (possiblyNested) {
        Repeat.call(node)
      }
    }

    if (raw.nodeName === 'SELECT' && raw.dataset['model']) {
      Model.Updater.call(raw, ctx, Silica.getValue(raw, raw.dataset['model']))
    }

    if (ctx['renderedRepeat']) {
      ctx['renderedRepeat'](raw)
    } else if (ctx['$ctrl'] && ctx['$ctrl']['renderedRepeat']) {
      ctx['$ctrl']['renderedRepeat'](raw)
    }
  }
}

exports = Repeat
