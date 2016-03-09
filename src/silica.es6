import Controllers from './controllers/controllers';

var Silica = {
  context               :  window,
  contextName           :  '',
  directives            :  {},
  filters               :  {},
  router                :  {},
  _ifs                  :  {}, // Stores the registered ifs
  _shws                 :  {}, // Stores the registered shows
  _klass                :  {}, // Stores the registered css class
  _watch                :  {}, // Stores the registered watchers
  _repeat_templates     :  {}, // Stores a map between repeats and their templates
  interpolationPattern  :  /\{\{(.*?)\}\}/,

  // Set the root context
  setContext(contextName)
  {
    this.contextName = contextName;
    this.context = window[contextName];
  },

  setRouter(router)
  {
    this.router = router;
    window.onhashchange = () => {
      this.apply(() => this.router.route(location.hash));
    };
    window.onpopstate = () => {
      this.apply(() => this.router.route(location.pathname));
    };
  },

  goTo(pathname)
  {
    history.pushState(null, null, pathname);
    if (Silica.router) {
      Silica.apply(function() {
        Silica.router.route(location.pathname);
      });
    }
  },

  // Interpolate and link all Silica directives within an element
  compile(element, flush = true, context = null, onlySafe = false)
  {
    var func, k, _ref;
    if (!(element instanceof jQuery))
    {
      element = $(element);
    }
    if (element[0] == document)
    {
      element[0] = document.firstElementChild;
      context = context || {};
    }
    else
    {
      context = context || Silica.getContext(element);
      if (!onlySafe)
      {
        element[0]._rt_ctx = context;
      }
    }
    Silica.cacheTemplates(element[0]);
    Silica.interpolate(element, context, flush);
    for (let key in Silica.compilers)
    {
      if (!(onlySafe & key[0] === '_'))
      {
        Silica.compilers[key].apply(element, [context]);
      }
    }
    if (flush) {
      Silica.flush(element, true);
    }

    Silica._capture_links(element);

    return element;
  },

  cacheTemplates(element)
  {
    let nodes = element.querySelectorAll('[data-repeat]');
    let node;
    let hash;
    for (let i = nodes.length - 1; i >= 0; --i)
    {
      node = nodes[i];
      if (!node.dataset._rt_repeat_template)
      {
        hash                              =  SparkMD5.hash(node.innerHTML);
        Silica._repeat_templates[hash]   =  node.firstElementChild;
        node.dataset._rt_repeat_template  =  hash;
        node.innerHTML                    =  "";
      }
    }
  },
  flush(element = document, onlySafe = false, changed = null, skipSchedule = false)
  {
    if (Silica.isInFlush && !skipSchedule) {
      if (Silica._scheduledFlush) {
        return;
      } else {
        Silica._scheduledFlush = true;
      }
    }
    Silica.isInFlush = !skipSchedule;
    if (changed === null) {
      let funcs;
      let func;
      for (let key in Silica._watch) {
        if (Silica._watch.hasOwnProperty(key)) {
          funcs = Silica._watch[key];
          for (let i = funcs.length - 1; i >= 0; --i) {
            func = funcs[i];
            func[1].apply(func[0]);
          }
        }
      }
    } else {
      let obj, k;
      for (k in changed) {
        obj = changed[k];
        if (obj !== true) {
          for (let func of obj){
            func[1].apply(func[0]);
          }
        } else {
          obj = Silica._watch[k];
          for (let func of obj) {
            func[1].apply(func[0]);
          }
        }
      }
    }
    let watchers = Silica.watchers;
    let func;
    for (let k in watchers) {
      if (onlySafe && k[0] === '_') {
        continue;
      }
      func = watchers[k];
      func.apply(element);
    }
    Silica.isInFlush = skipSchedule;
    if (Silica._scheduledFlush === true && !skipSchedule) {
      Silica._scheduledFlush = false;
      window.setTimeout(function(){ Silica.flush(document, false, {}); }, 20);
    }
    return Silica;
  },

  apply(func, element = document) {
    var args, assoc, changed, changes, finalChanges, funcs, k, oldVal, old_values, v, val, _i, _j, _k, _len, _len1, _len2, _ref, _ref1, _ref2;
    if (Silica.isInApply) {
      return func.call();
    }
    old_values = {};
    var association;
    for (let property in Silica._watch)
    {
      funcs = Silica._watch[property];
      old_values[property] = [];
      //Check if we are looking at an object property (starts with a lowercase)
      //or global property (starts with an uppercase).
      //Lowercase has charCode 97-122 inclusive
      if (property.charCodeAt(0) >= 97)
      {
        // association is an array of length 2 where first element is the object
        // and the second is the function on the object to execute when value
        // changes
        for (association of funcs)
        {
          //Get the current value
          val = Silica.getPropByString(association[0], property);
          //Shallow copy the value if it is an array
          if (Array.isArray(val))
          {
            val = val.slice();
          }
          //Store the value as an array of [object, value] where value is the
          //value of watched property of object
          old_values[property].push([association[0], val]);
        }
      }
      else
      {
        val = Silica.getPropByString(window, property);
        if (Array.isArray(val))
        {
          val = val.slice();
        }
        old_values[property] = val;
      }
    }

    // Mark we are about to execute the function
    // If the function to execute triggers another apply, the flag is checked
    // and the additional applies can be executed with out the need to diff the
    // properties since no flush has executed.
    Silica.isInApply = true;
    // Execute the function
    func.call();
    // Clear mark
    Silica.isInApply = false;

    // Compute the differences
    // TODO: Store the new values as the old values for the next round
    changes = {};
    _ref1 = Silica._watch;
    for (k in _ref1) {
      funcs = _ref1[k];
      // Check if we are looking at Global or object property key
      if (k.charCodeAt(0) >= 97) {
        changes[k] = [];
        for (_j = 0, _len1 = funcs.length; _j < _len1; _j++) {
          func = funcs[_j];
          if (k.match(/\.\*$/)) {
            changes[k].push(func);
          } else {
            val = Silica.getPropByString(func[0], k);
            _ref2 = old_values[k];
            for (_k = 0, _len2 = _ref2.length; _k < _len2; _k++) {
              args = _ref2[_k];
              if (args[0] === func[0]) {
                oldVal = args[1];
              }
            }
            changed = val !== oldVal;
            if (Array.isArray(val) && Array.isArray(oldVal)) {
              changed = oldVal && val ? oldVal.length !== val.length : true;
              if (!changed) {
                changed = oldVal.some(function(e, idx) {
                  return val[idx] !== e;
                });
              }
            }
            if (changed) {
              changes[k].push(func);
            }
          }
        }
      } else {
        val = Silica.getPropByString(window, k);
        oldVal = old_values[k];
        changed = val !== oldVal;
        if (Array.isArray(val) && Array.isArray(oldVal)) {
          changed = oldVal && val ? oldVal.length !== val.length : true;
          if (!changed) {
            changed = oldVal.some(function(e, idx) {
              return val[idx] !== e;
            });
          }
        }
        changes[k] = changed;
      }
    }
    finalChanges = {};
    for (k in changes) {
      v = changes[k];
      if ((Array.isArray(v) && v.length) || v === true) {
        finalChanges[k] = v;
      }
    }
    return Silica.flush(element, false, finalChanges);
  },

  // Walk through an object to get the specified property.
  // Nested properties are specified using '.' syntax
  // Function properties will be called and the result will be walked as well
  getPropByString(obj, propString, params)
  {
    if (!propString)
    {
      return obj;
    }

    let comps = propString.split('.');
    if (!obj[comps[0]])
    {
      if (obj.$ctrl)
      {
        obj = obj.$ctrl;
      }
      else
      {
        return null;
      }
    }

    let context;
    let property_path = propString.split('.');
    let path_length = property_path.length;
    let property;
    for (let i = 0; i < path_length; ++i)
    {
      property = property_path[i];
      context = obj;
      obj = obj[property];
      if (typeof obj === 'function')
      {
        obj = obj.call(context, params);
      }
      if (obj === null || obj === void 0)
      {
        return null;
      }
    }
    return obj;
  },

  getValue(raw, propString, context = null, params = null) {
    var ctx;
    ctx = context ? context : propString.charCodeAt(0) <= 90 ? window : Silica.getContext(raw);
    //TODO: This breaks when in the following case:
    // div.data-controller=childcontroller > div.data-class=rootController >
    // div.data-repeat=childContailer.model => the model is looked up on the
    // rootController as that is the next found context
    //raw._rt_ctx = ctx;
    return Silica.getPropByString(ctx, propString, params);
  },

  isInDOM(element) {
    while (element.parentElement != null) {
      if (element.parentElement == document.body) {
        return true;
      } else {
        element = element.parentElement;
      }
    }
    return false;
  },

  setPropByString(obj, propString, value) {
    var key, paths, prop, _i, _len, _ref, _ref1, ctx;
    if (!propString) {
      return obj;
    }

    paths = propString.split('.');
    key = paths[paths.length - 1];

    if (propString.charCodeAt(0) <= 90)
    {
      ctx = window;
    }
    else
    {
      if (!obj.hasOwnProperty(paths[0]) && obj.hasOwnProperty('$ctrl'))
      {
        ctx = obj.$ctrl;
      } else {
        ctx = obj;
      }
    }

    for (_i = 0, _len = paths.length; _i < _len; _i++) {
      prop = paths[_i];
      if (prop !== key) {
        if (typeof ctx[prop] === 'function')
        {
          ctx = ctx[prop].call(ctx);
        } else {
          ctx = ctx[prop];
        }
      }
    }

    let old_value = ctx[prop];
    ctx[prop] = value;

    let hook = ctx[prop + "_changed"];
    if (hook)
    {
      hook.call(ctx, old_value, value);
    }
  },
  evaluateExpression(expr, $elm, ctx = {}) {
    var filter, filterKey, filterOptions, value;
    if (!expr) {
      return;
    }
    filter = null;
    if (expr.match('|')) {
      expr = expr.split('|');
      filter = $.trim(expr[1]);
      expr = $.trim(expr[0]);
    }
    if (!ctx.$ctrl)
    {
      ctx.$ctrl = Silica.getContext($elm);
    }

    //Expr refers to a global property so it must be in window context
    if (expr.charCodeAt(0) <= 90) {
      ctx = window;
    }

    value = Silica.getPropByString(ctx, expr);

    if (filter) {
      filter = filter.split(/:(.+)/);
      filterKey = filter ? filter[0] : null;
      filterOptions = filter && filter.length > 1 ? eval(filter[1]) : null;
      filter = filterKey ? Silica.filters[filterKey] : null;
      value = filter ? filter(value, filterOptions, ctx) : value;
    }
    return value;
  },

  // Convert  mustache expressions into model bindings
  interpolate($elm, context = null, flush = true) {
    var element = ($elm instanceof jQuery ? $elm[0] : $elm); //TODO: Remove jQuery
    var elements = [];
    var children = element.childNodes;
    var text, match, expr, comps, property, fmt, filter, evald;
    var nodeIterator = document.createNodeIterator(
      // Node to use as root
      element,

      // Only consider nodes that are text nodes (nodeType 3)
      NodeFilter.SHOW_TEXT,

      // Object containing the function to use for the acceptNode method
      // of the NodeFilter
      { acceptNode: function(node) {
          // Logic to determine whether to accept, reject or skip node
          // In this case, only accept nodes that have content
          // matching the interpolation pattern
          if (Silica.interpolationPattern.test(node.data)) {
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      },
      false
    );

    var node;
    // Walk through each node that contains the interpolation pattern
    while ((node = nodeIterator.nextNode()))
    {
      // Get the raw text
      text = node.data;
      // While the raw text contains the interpolation pattern
      // loop and replace the pattern with the compiled elemenent
      while((match = text.match(Silica.interpolationPattern)) !== null)
      {
        // The expression to evaluate
        expr = match[1];
        // Split on the pipe operator
        comps = expr.split('|');
        // The property to bind to
        property = comps[0].trim();
        // Check for a filter (pipe)
        if (comps.length === 1)
        {
          fmt = "<span data-model='" + property + "'>{{val}}</span>";
        }
        else
        {
          filter = comps[1].trim();
          fmt = "<span data-model='" + property + "' data-filter='" + filter + "'>{{val}}</span>";
        }
        // Evaluate and replace the expression
        evald = fmt.replace('{{val}}', Silica.evaluateExpression(expr, node, context));
        text = text.replace("{{" + expr + "}}", evald);
      }
      // Create a new element containing the interpolated text
      var span = document.createElement('span');
      span.innerHTML = text;

      // Replace the original node with the created ones
      // This must be done in a loop to preserve original whitespace
      var parentNode = node.parentNode;
      while (span.childNodes.length > 0)
      {
        parentNode.insertBefore(span.firstChild, node);
      }
      parentNode.removeChild(node);

      // Compile the interpolated result
      Silica.compile(span, flush, context);
    }
  },

  addFilter(key, func) {
    Silica.filters[key] = func;
  },
  addDirective(key, obj) {
    Silica.directives[key] = obj;
  },
  getContext(element) {
    var $elm, constructor, ctrl, k, v, _ref, raw, ctx;
    raw = element instanceof jQuery ? element[0] : element; //TODO: remove jQuery
    while (true)
    {
      if (raw._rt_ctx) {
        return raw._rt_ctx;
      } else if (raw._rt_ctrl) {
        return raw._rt_ctrl;
      } else if (raw.nodeName === 'BODY') {
        return Silica.context;
      } else if (raw.nodeType !== 9 && raw.nodeType !== 3 && raw.nodeType !== 8 && raw.dataset && raw.dataset.controller) {
        constructor = raw.dataset.controller;
        if (typeof (_ref = constructor.match(/((?:\w|\.)+)(?:\((\w+)\))*/))[2] !== 'undefined')
        {
          model = Silica.getValue(raw.parentNode,  _ref[2]);
        }
        constructor = _ref[1];
        constructor = eval(constructor);
        if (!constructor) {
          return console.error("Unknown Controller: " + raw.dataset.controller);
        }
        if (typeof model !== 'undefined')
        {
          ctrl = new constructor(raw, model);
        }
        else
        {
          ctrl = new constructor(raw);
        }
        raw._rt_live = true;
        raw._rt_ctrl = ctrl;
        _ref = constructor.watchers;
        for (k in _ref) {
          v = _ref[k];
          if (!Silica._watch[k]) {
            Silica._watch[k] = [];
          }
          Silica._watch[k].push([ctrl, v]);
        }
        if (typeof ctrl.onLoad === "function") {
          ctrl.onLoad();
        }
        return ctrl;
      } else if (raw.parentElement) {
        raw = raw.parentElement;
      } else {
        return Silica.context;
      }
    }
  },
  _handle_href(evt){
    evt.preventDefault();
    history.pushState(null, null, this.href);
    if (Silica.router) {
      Silica.apply(function() {
        Silica.router.route(location.pathname);
      });
    }
    return false;
  },
  _capture_links(element) {
    //Capture lnks for pushState
    let nodes = Silica.queryOfType(element, 'a', '[href]', '[data-href]');
    let node;
    let externalRegexp = /:\/\//
    for (let i = nodes.length - 1; i >= 0; --i)
    {
      node = nodes[i];
      if (node.hostname === location.hostname)
      {
        node.removeEventListener("click", Silica._handle_href, true);
        node.addEventListener("click", Silica._handle_href, true);
      }
    }
  },
  _show(element, expr, negate) {
    var $elm, ctx, isVisible;
    isVisible = true;
    if (expr.indexOf(Silica.contextName) === 0) {
      isVisible = Silica.getPropByString(Silica.context, expr.substr(Silica.contextName.length + 1));
    } else {
      if (element.nodeType !== 8 && (typeof (ctx = element._rt_ctx)) !== "undefined") {
        isVisible = Silica.getPropByString(ctx, expr);
      } else {
        ctx = Silica.getContext(element);
        element._rt_ctx = ctx;
        isVisible = Silica.getPropByString(ctx, expr);
      }
    }
    if (negate) {
      isVisible = !isVisible;
    }
    return isVisible;
  },
  _call(element, evnt, act)
  {
    evnt.preventDefault();
    Silica.apply(function()
    {
      var $elm, action, ctx, model, obj, parameter;
      $elm = $(element);
      ctx = Silica.getContext($elm);
      action = $elm.data(act);
      action = action.match(/(\w+)(?:\((\w+)\))*/);
      if (typeof action[2] !== 'undefined')
      {
        model = action[2];
      }
      action = action[1];
      if (model) {
        obj = ctx[model];
      }
      while (!ctx.hasOwnProperty(action) && ctx.hasOwnProperty('$ctrl'))
      {
        ctx = ctx.$ctrl;
      }
      if (element.dataset.parameter) {
        parameter = element.dataset.parameter;
      }

      if (ctx.hasOwnProperty(action) || typeof ctx[action] !== 'undefined') {
        return ctx[action].apply(ctx, [$elm, obj, parameter]);
      } else if (Silica.context[action] != null) {
        return Silica.context[action].apply(Silica.ctx, [$elm, obj, parameter]);
      } else {
        return console.error("Unknown action '" + action + "' for " + $elm[0].outerHTML + " in " + ctx.constructor.name);
      }
    });
  },
  _model_get_val(raw)
  {
    var filter, filterKey, filterOptions, value;
    filter = raw.dataset.filter;
    filter = filter ? filter.split(/:(.+)/) : null;
    filterKey = (filter ? filter[0] : null);
    if (filterKey && !Silica.filters[filterKey]) {
      throw new Error("Unknown filter: '" + filterKey + "' for element: " + raw.outerHTML);
    }
    filterOptions = filter && filter.length > 1 ? eval(filter[1]) : null;
    filter = filterKey ? Silica.filters[filterKey] : null;
    value = Silica.getValue(raw, raw.dataset.model);
    if (filter && value != null) {
      return filter(value, filterOptions);
    } else {
      return value;
    }
  },
  findComments(root)
  {
    var arr = [];
    var raw = root instanceof jQuery ? root[0] : root;
    for (var i = raw.childNodes.length - 1; i >= 0; --i)
    {
      var node = raw.childNodes[i];
      if (node.nodeType === 8)
      {
        arr.push(node);
      }
      else
      {
        arr.push.apply(arr, Silica.findComments(node));
      }
    }
    return arr;
  },
  query(root, ...attributes) {
    var raw = (root instanceof jQuery ? root[0] : root);
    if (raw == document) {
      raw = document.firstElementChild;
    }
    var isSingle = attributes.length == 1;
    var nodes = raw.querySelectorAll(attributes.join(','));
    var filtered = [];
    for (let i = nodes.length - 1; i >=0; --i)
    {
      let node = nodes.item(i);
      //TODO: This prevents multiple data-* for the same element, need to
      //return all elements and have the complex compilers not reattach to the
      //element (data-controller, data-repeat)
      /*
      if (!node._rt_live)
      {
      */
        filtered.push(node);
      /*
      }
      */
    }
    if (!raw.rt_live)
    {
      let attribute;
      for (let i = attributes.length - 1; i >=0; --i)
      {
        attribute = attributes[i];
        if (raw.hasAttribute(attribute.substring(1, attribute.length-1)))
        {
          filtered.push(raw);
          break;
        }
      }
    }
    return filtered;
  },

  queryWithComments(root, ...attributes)
  {
    var filtered = Silica.query(root, ...attributes);
    var comments = Silica.findComments(root);

    var temp = document.createElement("div");
    for (var i = comments.length - 1; i >= 0; --i)
    {
      var node = comments[i];
      // Check node is a commented out tag, not just text
      if (node.nodeValue.charAt(0) === "<")
      {
        // Convert the comment back to live version to check attributes
        temp.innerHTML = node.nodeValue;
        if (temp.firstElementChild.hasAttributes(attributes.join(",")))
        {
          filtered.push(node);
        }
      }
    }

    return filtered;
  },

  querySorted(root, ...attributes) {
    var filtered = Silica.query(root, ...attributes);

    for (var i = 0, list_length = filtered.length; i < list_length; i++) {
      var node = filtered[i];
      for (var j = i+1; j < list_length; j++) {
        var other = filtered[j];
        if (other.contains(node)) {
          filtered[i] = other;
          filtered[j] = node;
        }
      }
    }

    return filtered;
  },

  queryOfType(root, type, ...attributes)
  {
    var raw = (root instanceof jQuery ? root[0] : root);
    if (raw == document) {
      raw = document.firstElementChild;
    }
    var isSingle = attributes.length == 1;
    var nodes = raw.getElementsByTagName(type);
    var filtered = [];
    for (let i = nodes.length - 1; i >=0; --i)
    {
      let node = nodes.item(i);
      if (!node._rt_live)
      {
        for (let j = attributes.length - 1; j >=0; --j)
        {
          if (node.hasAttribute(attributes[j].replace(/\[|\]/g, "")))
          {
            filtered.push(node);
            break;
          }
        }
      }
    }
    if (raw.tagName === type && !raw.rt_live)
    {
      let attribute;
      for (let i = attributes.length - 1; i >=0; --i)
      {
        attribute = attributes[i];
        if (raw.hasAttribute(attribute.substring(1, attribute.length-1)))
        {
          filtered.push(root);
          break;
        }
      }
    }
    return filtered;
  },
  removeFromDOM(e) {
    for (var i = 0; i < e.childNodes.length; ++i) {
          var child = e.childNodes[i];
          Silica.removeFromDOM(child);
          if (typeof child.onremove == 'function') {
              child.onremove();
          }
      }
      e.remove();
  },
  compilers: {
    directives() {
      for (let k in Silica.directives)
      {
        if (Silica.directives.hasOwnProperty(k))
        {
          let obj = Silica.directives[k];
          let nodes = Silica.queryOfType(this, k);
          let wrapper = document.createElement("div");
          for (let i = nodes.length - 1; i >= 0; --i)
          {
            // A node can only be used once, so create a new instance for each
            wrapper.innerHTML = obj.template;
            let newChild = wrapper.firstChild;
            let node = nodes[i];
            node.parentNode.replaceChild(newChild, node);
          }
        }
      }
    },
    "_if": function() {
      var nodes = Silica.queryWithComments(this, '[data-if]');
      var isVisible, negate, raw, val, node;
      var temp = document.createElement("div");
      for (let i = nodes.length - 1; i >=0; --i)
      {
        node = nodes[i];
        if (node.nodeType === 8)
        {
          temp.innerHTML = node.nodeValue;
          raw = val = temp.firstElementChild.dataset["if"];
        }
        else
        {
          raw = val = node.dataset['if'];
        }
        negate = val[0] === '!';
        if (negate) {
          val = val.substr(1);
        }
        if (!Silica._ifs[raw]) {
          Silica._ifs[raw] = [];
        }
        isVisible = Silica._show(node, val, negate);
        if (isVisible)
        {
          if (node.nodeType !== 8)
          {
            Silica._ifs[raw].push(node);
          }
          else
          {
            let live = temp.firstElementChild;
            Silica._ifs[raw].push(live);
            node.parentElement.insertBefore(live, node);
            node.remove();
            node = live;
          }

          if ((_ref = Silica.getContext(node)) != null) {
            if (typeof _ref.onLoad === "function") {
              _ref.onLoad();
            }
          }
        }
        else if (node.nodeType !== 8)
        {
          // Remove subnodes registered with Silica
          let subNodes = Silica.queryWithComments(node, '[data-if]');
          let subNode;
          for (let j = subNodes.length - 1; j >= 0; --j)
          {
            subNode = subNodes[j];
            var $e, list, prop, _ref;
            prop = subNode.dataset['if'];
            list = Silica._shws[prop];
            Silica._shws[prop] = (_ref = list != null ? list.filter(function(obj) {
              return !$(obj).is($e);
            }) : void 0) != null ? _ref : [];
          }
          subNodes = Silica.query(this, "[data-controller]");
          for (let j = subNodes.length - 1; j >= 0; --j)
          {
            subNode = subNodes[j];
            let ctrl = this._rt_ctrl;;
            let k, list, _ref;
            // Note: This is compilled, need to change it to something more
            // readable
            for (k in ctrl != null ? ctrl.watchers : void 0) {
              list = Silica._watch[k];
              Silica._watch[k] = (list != null ? list.filter(function(obj) {
                return obj[0] !== ctrl;
              }) : []);
            }
          }
          comment = document.createComment(node.outerHTML);
          Silica._ifs[raw].push(comment);
          node.parentNode.replaceChild(comment, node);
        }
      }
    },
    show() {
      var nodes = Silica.query(this, "[data-show]");
      var node;
      var $elm, isVisible, negate, raw, val;
      for (var i = nodes.length - 1; i >= 0; --i)
      {
        node = nodes[i];
        $elm = $(node);
        raw = val = $elm.data('show');
        negate = val[0] === '!';
        if (negate) {
          val = val.substr(1);
        }
        if (!Silica._shws[raw]) {
          Silica._shws[raw] = [];
        }
        if (Silica._shws[raw].some(function(obj) { return $(obj).is($elm);}))
        {
          continue;
        }
        $elm[0].onremove = function() {
          var list, _ref = $elm[0];
          list = Silica._shws[raw];
          if (list !== undefined && list !== null)
          {
            Silica._shws[raw] =  list.filter(function(obj)
            {
              return $elm[0] !== _ref;
            });
          }
          else
          {
            Silica._shws[raw] = [];
          }
        };
        isVisible = Silica._show($elm, val, negate);
        Silica._shws[raw].push(node);
        if (isVisible) {
          $elm.removeClass('hidden');
        } else {
          $elm.addClass('hidden');
        }
      }
    },
    "class": function() {
      var raw = (this instanceof jQuery ? this[0] : this);
      var nodes = Silica.query(raw, "[data-class]");
      var node;
      var klass;

      if (raw.nodeType != 9 && raw.dataset.class)
      {
        raw.dataset._rt_hard_klass = raw.className;
        klass = Silica.getValue(raw, raw.dataset.class);
        if (klass)
        {
          raw.classList.add(klass);
        }
      }

      for (let i = nodes.length - 1; i >= 0; --i)
      {
        node = nodes[i];
        node.dataset._rt_hard_klass = node.className.split('hidden').join(" ").trim();
        klass = Silica.getValue(node, node.dataset.class);
        if (klass)
        {
          node.classList.add(klass);
        }
      }
    },

    disabled()
    {
      var raw = (this instanceof jQuery ? this[0] : this);
      var nodes = Silica.query(raw, '[data-disabled]');
      var node;
      for (let i = nodes.length - 1; i >= 0; --i)
      {
        node = nodes[i];
        if (Silica.getValue(node, node.dataset.disabled))
        {
          node.setAttribute("disabled", true);
        }
        else
        {
          node.removeAttribute("disabled");
        }
      }
    },

    href()
    {
      var raw = (this instanceof jQuery ? this[0] : this);
      var nodes = Silica.query(raw, '[data-href]');
      var node;
      for (let i = nodes.length - 1; i >= 0; --i)
      {
        node = nodes[i];
        node.setAttribute("href", Silica.getValue(node, node.dataset.href));
      }
      Silica._capture_links(raw);
    },

    style()
    {
      var raw = (this instanceof jQuery ? this[0] : this);
      var nodes = Silica.query(raw, '[data-style]');
      var node;
      for (let i = nodes.length - 1; i >= 0; --i)
      {
        node = nodes[i];
        node.setAttribute("style", Silica.getValue(node, node.dataset.style));
      }
    },

    include() {
      var raw = (this instanceof jQuery ? this[0] : this);
      var nodes = Silica.query(raw, '[data-style]');
      var node, partial;
      for (let i = nodes.length - 1; i >= 0; --i)
      {
        node = nodes[i];
        partial = eval(node.dataset.include);
        delete node.dataset.include;
        $(node).load(partial, function() {
          Silica.compile(this);
          var ctx = Silica.getContext(this);
          if (ctx.onLoad && typeof ctx.onLoad === "function")
          {
            ctx.onLoad(this);
          }
        });
      }
    },
    controller() {
      var nodes = Silica.query(this, "[data-controller]")
      var node, $elm, constructor, ctrl, k, v, _ref, model;
      for (let i = nodes.length - 1; i >= 0; --i)
      {
        node = nodes[i];
        if (node._rt_ctrl !== undefined) {
          continue;
        }
        $elm = $(node);
        constructor = $elm.data('controller');
        if (typeof (_ref = constructor.match(/((?:\w|\.)+)(?:\((\w+)\))*/))[2] !== 'undefined')
        {
          model = Silica.getValue($elm.parent()[0],  _ref[2]);
        }
        constructor = _ref[1];
        constructor = eval(constructor);
        if (!constructor) {
          return console.error("Unknown Controller: " + ($elm.data('controller')));
        }
        if (typeof model !== 'undefined')
        {
          ctrl = new constructor(node, model);
        }
        else
        {
          ctrl = new constructor(node);
        }
        node._rt_live = true;
        node._rt_ctrl = ctrl;
        _ref = constructor.watchers;
        for (k in _ref) {
          v = _ref[k];
          if (!Silica._watch[k]) {
            Silica._watch[k] = [];
          }
          Silica._watch[k].push([ctrl, v]);
        }
        if (typeof ctrl.onLoad === "function") {
          ctrl.onLoad();
        }
      }
    },
    click() {
      var nodes = Silica.query(this, "[data-click]");
      var node;
      for (let i = nodes.length - 1; i >= 0; --i)
      {
        node = nodes[i];
        node._rt_live = true;
        node.onclick = function(evt) {
          Silica._call(this, evt, 'click');
        };
      }
    },
    dblclick() {
      var nodes = Silica.query(this, "[data-dblclick]");
      var node;
      for (let i = nodes.length - 1; i >= 0; --i)
      {
        node = nodes[i];
        node._rt_live = true;
        node.ondblclick = function(evt) {
          Silica._call(this, evt, 'dblclick');
        };
      }
    },
    blur() {
      var nodes = Silica.query(this, "[data-blur]");
      var node;
      for (let i = nodes.length - 1; i >= 0; --i)
      {
        node = nodes[i];
        node._rt_live = true;
        node.onblur = function(evt) {
          Silica._call(this, evt, 'blur');
        };
      }
    },
    focus() {
      var nodes = Silica.query(this, "[data-focus]");
      var node;
      for (let i = nodes.length - 1; i >= 0; --i)
      {
        node = nodes[i];
        node._rt_live = true;
        node.onfocus = function(evt) {
          Silica._call(this, evt, 'focus');
        };
      }
    },
    tabs() {
      var li, pane, template;
      li = '<li><a href="#" data-click="open"></a></li>';
      pane = '<div class="tab-pane"></div>';
      template = '<div class="tabbable"><ul class="nav nav-tabs"></ul><div class="tab-content"></div></div>';
      return $('*[data-tabs]', this).each(function() {
        var $elm, $target, tabCtrl;
        $elm = $(this);
        $target = $(template);
        $target.addClass($elm.attr('class'));
        tabCtrl = {
          open: function(el) {
            $('.active', $target).removeClass('active');
            $(el).parent().addClass('active');
            return $(".tab-pane[title='" + ($(el).parent().attr('title')) + "']", $target).addClass('active');
          }
        };
        $target[0]._rt_ctrl = tabctrl;
        $('*[data-pane]', $elm).each(function() {
          var $link, $pane, newPane, title;
          $pane = $(this);
          $link = $(li);
          title = $pane.attr('title');
          $link.attr('title', title);
          $('a', $link).html(title);
          $('ul.nav', $target).append($link);
          newPane = $(pane).append($pane.children());
          newPane.attr('title', title);
          return $('.tab-content', $target).append(newPane);
        });
        tabCtrl.open($('li:first-child > a', $target));
        return $elm.replaceWith(Silica.compile($target));
      });
    },
    model(context = null) {
      var elm, change, ctx, model, val;
      var elements = Silica.query(this, 'input[data-model]', 'select[data-model]', 'textarea[data-model]', 'option[data-model]');
      for (let i = elements.length - 1; i >= 0; i--)
      {
        //ctx = context != null ? context : Silica.getContext($elm);
        elm = elements[i];
        ctx = Silica.getContext(elm);
        model = elm.dataset.model;
        let type = elm.type;
        if (type === 'text' || type === 'file' || type === 'number' ||
            type === 'email' || type === 'password' || type === 'time') {
          elm.value = Silica.getValue(elm, model, ctx);
        } else if (type === 'radio') {
          val = elm.value;
          if (val.match(/[0-9]/)) {
            val = parseInt(val);
          }
          elm.checked = Silica.getValue(elm, model, ctx) === val;
        } else if (type === 'checkbox') {
          elm.checked = Silica.getValue(elm, model, ctx);
        } else if (elm.nodeName === 'OPTION') {
          elm.value = Silica.getValue(elm, model, ctx);
        }
        change = function() {
          var obj, _ref, _ref1, _ref2;
          var val = this.value, ctx = Silica.getContext(this), model = this.dataset.model;
          if (this.type === 'radio') {
            if (val.match(/[0-9]/)) {
              val = parseInt(val);
            }
          } else if (this.type === 'checkbox') {
            val = this.checked;
          }
          if (Silica.isInApply) {
            obj = (_ref = this._rt_ctx) != null ? _ref : ctx;
            Silica.setPropByString(obj, model, val);
          } else if ((_ref = this.dataset.trap) != null) {
            obj = (_ref1 = this._rt_ctx) != null ? _ref1 : ctx;
            let scope;
            if (_ref.toLowerCase() === "true")
            {
              scope = this;
            }
            else
            {
              scope = document;
              _ref1 = this;
              while ((_ref1 = _ref1.parentElement) && _ref1.length)
              {
                if (_ref1.classList.contains(_ref))
                {
                  scope = _ref1;
                  break;
                }
              }
            }
            Silica.apply(function() {
              return Silica.setPropByString(obj, model, val);
            }, scope);
          } else {
            obj = (_ref2 = this._rt_ctx) != null ? _ref2 : ctx;
            Silica.apply(function() {
              return Silica.setPropByString(obj, model, val);
            });
          }
        };
        elm.onchange = change;
        elm.onkeyup = change;
        elm.onsearch = change;
        if (elm.hasAttribute('x-webkit-speech')) {
          elm.onwebkitspeechchange = change;
        }
      }
    },
    submit() {
      var raw = (this instanceof jQuery ? this[0] : this);
      var nodes = Silica.query(raw, '[data-submit]');
      var node;
      var handler = function(evt)
      {
        Silica._call(this, evt, 'submit');
        return false;
      };
      for (let i = nodes.length - 1; i >= 0; --i)
      {
        node = nodes[i];
        node.onsubmit = handler;
        node._rt_live = true;
      }
    },
    repeat(context = null) {
      var elements = Silica.querySorted(this, '[data-repeat]');
      let element;
      var $elm, child, children, ctx, expr, html, list, model, obj, repeat, template, raw, _ref;
      let fragment;
      for (var i = 0, length = elements.length; i < length; i++)
      {
        raw = elements[i];
        repeat = raw.dataset.repeat.split(/\s+in\s+/);
        list = repeat[1];
        model = repeat[0];
        ctx = Silica.getContext(raw);

        //Check if we are calling a function with a param
        if (typeof (_ref = list.match(/((?:\w|\.)+)(?:\((\w+)\))*/))[2] !== 'undefined')
        {
          let funcName = _ref[1];
          let param = _ref[2];
          param = Silica.getValue(raw.parentNode, param);

          list = Silica.getValue(raw,  _ref[1], null, param);
        }
        else
        {
          list = Silica.getPropByString(ctx, list);
        }

        listHash = SparkMD5.hash(JSON.stringify(list, function(key, value){
          if (key.constructor == String && (key == '__elm' || key == '$ctrl'))
          {
            return undefined;
          }
          return value;
        }));
        raw._rt_ctrl = ctx;
        // Get the template
        template = Silica._repeat_templates[raw.dataset._rt_repeat_template];
        // Compile it
        context = {};
        context.$ctrl = ctx;
        template = Silica.compile($(template), false, context, true)[0];
        // Store the compiled template
        Silica._repeat_templates[raw.dataset._rt_repeat_template] = template;

        raw.innerHTML = "";

        if (ctx.renderedRepeat) {
          ctx.renderedRepeat(raw);
        } else if (ctx.$ctrl && ctx.$ctrl.renderedRepeat) {
          ctx.$ctrl.renderedRepeat(raw);
        }
      }
    },

    src() {
      var raw = (this instanceof jQuery ? this[0] : this);
      var nodes = Silica.queryOfType(raw, 'img', '[data-src]');
      var node;
      for (let i = nodes.length - 1; i >= 0; --i)
      {
        node = nodes[i];
        node.src = Silica.getValue(node, node.dataset.src);
      }
    }
  },
  watchers: {
    _updateIf() {
      var comment, compiled, element, elements, i, isVisible, k, negate, raw, _i, _len, _ref;
      _ref = Silica._ifs;
      for (k in _ref) {
        elements = _ref[k];
        if (Silica._ifs.hasOwnProperty(k)) {
          raw = k;
          negate = k[0] === '!';
          if (negate) {
            k = k.substr(1);
          }
          for (i = _i = 0, _len = elements.length; _i < _len; i = ++_i) {
            element = elements[i];
            isVisible = Silica._show(element, k, negate);
            if (isVisible) {
              if (element.nodeType === 8) {
                // Following contains jQuery remants, needs removal, compile
                // returns jqueyr wrapped node
                compiled = Silica.compile(element.nodeValue, false, Silica.getContext(element));
                element.parentNode.insertBefore(compiled[0], element);
                element.remove();
                Silica._ifs[raw][i] = compiled[0];
                let _ref;
                if ((_ref = Silica.getContext(compiled[0])) != null) {
                  if (typeof _ref.onLoad === "function") {
                    _ref.onLoad();
                  }
                }
              }
            } else {
              if (element.nodeType !== 8) {
                let subNodes = Silica.queryWithComments(element, '[data-if]');
                let subNode;
                for (let j = subNodes.length -1; j >= 0; --j)
                {
                  var $e, list, prop, _ref1;
                  subNode = subNodes[j];
                  prop = subNode.dataset['if'];
                  list = Silica._shws[prop];
                  Silica._shws[prop] = (_ref1 = list != null ? list.filter(function(obj) {
                    return !obj == subNode;
                  }) : void 0) != null ? _ref1 : [];
                }
                subNodes = Silica.query(element, '[data-controller]');
                for (let j = subNodes.length -1; j >= 0; --j)
                {
                  var ctrl, list, _ref1, _results;
                  subNode = subNodes[j];
                  ctrl = subNode._rt_ctrl;
                  for (k in ctrl != null ? ctrl.watchers : void 0) {
                    list = Silica._watch[k];
                    Silica._watch[k] = (list != null ? list.filter(function(obj) {
                      return obj[0] !== ctrl;
                    }) : []);
                  }
                }
                comment = document.createComment(element.outerHTML);
                comment.parentElement = element.parentElement;
                Silica._ifs[raw][i] = comment;
                element.parentNode.replaceChild(comment, element);
              }
            }
          }
        }
      }
    },

    updateRepeat() {
      var $elm, changed, child, container, context, ctx, expr, html, list, model, newList, newListHash, obj, oldList, repeat, rt_model, template, _i, _len, _ref;
      var elements = Silica.querySorted(this, '[data-repeat]');
      let raw, cache_display;
      let decache = function(node, skip) {
        if (!skip) {
          node._rt_decached_repeat_list = node._rt_repeat_list;
          delete node._rt_ctx;
          delete node._rt_ctrl;
          delete node._rt_repeat_list;
        }
        let children = node.children;
        for (let i = children.length - 1; i >= 0; --i)
        {
          decache(children[i]);
        }
      };
      for (let i =0, length = elements.length; i < length; ++i)
      {
        raw = elements[i];
        repeat = raw.dataset.repeat.split(/\s+in\s+/);
        list = repeat[1];
        model = repeat[0];
        ctx = Silica.getContext(raw);

        //Check if we are calling a function with a param
        if (typeof (_ref = list.match(/((?:\w|\.)+)(?:\((\w+)\))*/))[2] !== 'undefined')
        {
          let funcName = _ref[1];
          let param = _ref[2];
          param = Silica.getValue(raw.parentNode, param);

          newList = Silica.getValue(raw,  _ref[1], null, param);
        }
        else
        {
          newList = Silica.getValue(raw, list);
        }

        newListHash = SparkMD5.hash(JSON.stringify(newList, function(key, value){
          //Keys starting with an underscore (char code 95) will be ignored
          if (key.constructor == String && (key == '__elm' || key == '$ctrl' || key.charCodeAt(0) === 95))
          {
            return undefined;
          }
          return value;
        }));

        let existing = raw.childNodes;
        // Determine if we decached a list that didn't change, if so restore it
        if (newListHash && raw._rt_decached_repeat_list === newListHash)
        {
          raw._rt_repeat_list = newListHash;
          for (_i = 0, _len = newList.length;_i < _len;_i++) {
            obj = newList[_i];
            node = existing[_i];
            if (node._rt_ctx) {
              node._rt_ctx[model] = obj;
            } else {
              context = {};
              context[model] = obj;
              context.$ctrl = ctx;
              node._rt_ctx = context;
            }
          }
          continue;
        }
        oldList = raw._rt_repeat_list;
        changed = oldList && newList ? oldList !== newListHash : true;

        if (!changed) {
          continue;
        }

        if (newList) {
          raw._rt_repeat_list = newListHash;
        } else {
          raw._rt_repeat_list = null;
        }

        if (!newList) {
          raw.innerHTML = "";
          continue;
        }

        // Get the template
        template = Silica._repeat_templates[raw.dataset._rt_repeat_template];

        let count_diff = raw.childElementCount - newList.length;
        let node;

        while (count_diff > 0)
        {
          Silica.removeFromDOM(existing[count_diff-1]);
          --count_diff;
        }

        let fragment = document.createDocumentFragment();

        while (count_diff < 0)
        {
          context = {};
          context[model] = newList[0 - count_diff - 1];
          context.$ctrl = ctx;
          child = template.cloneNode(true);
          child._rt_ctx = context;
          Silica.compilers._if.call(child);
          Silica.compilers.repeat.call(child);
          Silica.compilers.click.call(child);
          Silica.compilers.dblclick.call(child);
          Silica.compilers.blur.call(child);
          Silica.compilers.model.call(child);
          Silica.compilers.show.call(child);
          Silica.compilers.disabled.call(child);
          Silica.compilers.href.call(child);
          fragment.appendChild(child);
          ++count_diff;
        }
        if (fragment.hasChildNodes())
        {
          raw.appendChild(fragment);
        }

        for (_i = 0, _len = newList.length; _i < _len; _i++)
        {
          obj = newList[_i];
          node = existing[_i];
          decache(node, true);
          if (node._rt_ctx)
          {
            node._rt_ctx[model] = obj;
          }
          else
          {
            context = {};
            context[model] = obj;
            context.$ctrl = ctx;
            node._rt_ctx = context;
          }
          Silica.flush(node, false, {});
        }

        if (ctx.renderedRepeat) {
          ctx.renderedRepeat(raw);
        } else if (ctx.$ctrl && ctx.$ctrl.renderedRepeat) {
          ctx.$ctrl.renderedRepeat(raw);
        }
      }
    },

    updateShow() {
      var element, elements, i, isVisible, k, negate, raw, _i, _len, _ref;
      _ref = Silica._shws;
      for (k in _ref) {
        elements = _ref[k];
        if (Silica._shws.hasOwnProperty(k)) {
          raw = k;
          negate = k[0] === '!';
          if (negate) {
            k = k.substr(1);
          }
          for (i = _i = 0, _len = elements.length; _i < _len; i = ++_i) {
            element = elements[i];
            if (!Silica.isInDOM(element)) {
              continue;
            }
            isVisible = Silica._show($(element), k, negate);
            if (isVisible && element.classList.contains('hidden')) {
              element.classList.remove('hidden');
            } else if (!isVisible && !element.classList.contains('hidden')) {
              element.classList.add('hidden');
            }
          }
        }
      }
    },
    updateClass() {
      var raw = (this instanceof jQuery ? this[0] : this);
      var elements = raw.querySelectorAll('[data-class]');
      var element;
      var klass;
      for (let i = elements.length - 1; i >= 0; --i)
      {
        element = elements[i];
        element.className = element.dataset._rt_hard_klass;
        klass = Silica.getValue(element, element.dataset.class);
        if (klass)
        {
          if (klass instanceof Array)
          {
            element.classList.add.apply(element.classList, klass);
          }
          else
          {
            element.classList.add(klass);
          }
        }
        if (element.dataset.show != null) {
            var key = element.dataset.show;
            var negate = key[0] == "!";
            isVisible = Silica._show($(element), key, negate);
            if (isVisible && element.classList.contains('hidden')) {
              element.classList.remove('hidden');
            } else if (!isVisible && !element.classList.contains('hidden')) {
              element.classList.add('hidden');
            }
        }
      }

    },

    updateDisabled()
    {
      Silica.compilers.disabled.call(this);
    },

    updateHref()
    {
      Silica.compilers.href.call(this);
    },

    updateStyle()
    {
      Silica.compilers.style.call(this);
    },

    updateSrc() {
      Silica.compilers.src.call(this);
    },

    updateModel() {
      var raw = (this instanceof jQuery ? this[0] : this);
      var elements = raw.querySelectorAll('[data-model]');
      var element, i, type;
      for (i = elements.length - 1; i >= 0; --i)
      {
        element = elements[i];
        type = element.type;
        if (element !== document.activeElement && (type === 'text' || type === 'file' || type === 'number' ||
            type === 'email' || type === 'password' || type === 'time' || type === 'select-one' || type === "textarea"))
        {
          element.value = Silica._model_get_val(element);
        }
        else if (type === 'radio')
        {
          val = element.value;
          if (val.search(/[0-9]/) != -1) {
            val = parseInt(val);
          }
          element.checked = Silica.getValue(element, element.dataset.model) === val;
        }
        else if (type === 'checkbox')
        {
          element.checked = Silica.getValue(element, element.dataset.model);
        }
        else if (element.nodeName === 'SPAN')
        {
          val = Silica._model_get_val(element);
          if (val && val.nodeName) {
              element.innerHTML = "";
              element.appendChild(val);
          } else {
            element.innerHTML = val;
          }
        }
        else if (element.nodeName === 'OPTION')
        {
          element.value = Silica._model_get_val(element);
        }
      }
    },
  }
};

Silica.Controllers = Controllers;
window.Silica = Silica;
