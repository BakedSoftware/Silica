import Controllers from './controllers/controllers';

var Runtime = {
  context      :  window,
  contextName  :  '',
  directives   :  {},
  filters      :  {},
  router       :  {},
  _ifs         :  {}, // Stores the registered ifs
  _shws        :  {}, // Stores the registered shows
  _klass       :  {}, // Stores the registered css class
  _watch       :  {}, // Stores the registered watchers
  interpolationPattern: /\{\{(.*?)\}\}/,

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
  },

  // Interpolate and link all Runtime directives within an element
  compile(element, flush = true, context = null)
  {
    var func, k, _ref;
    if (!(element instanceof jQuery))
    {
      element = $(element);
    }
    if (element == document)
    {
      context = context || {};
    }
    else
    {
      context = context || Runtime.getContext(element);
      element[0]._rt_ctx = context;
    }
    Runtime.cacheTemplates(element[0]);
    Runtime.interpolate(element, context, flush);
    for (let key in Runtime.compilers)
    {
      if (key[0] !== '_')
      {
        Runtime.compilers[key].apply(element, [context]);
      }
    }
    if (flush) {
      Runtime.flush(element, true);
    }
    return element;
  },

  cacheTemplates(element)
  {
    let nodes = element.querySelectorAll('[data-repeat]');
    let node;
    for (let i = nodes.length - 1; i >= 0; --i)
    {
      node = nodes[i];
      if (!node._rt_repeat_template)
      {
        node._rt_repeat_template = node.innerHTML;
        node.innerHTML = "";
      }
    }
  },
  flush(element = document, onlySafe = false, changed = {})
  {
    if (Runtime.isInFlush) {
      if (Runtime._scheduledFlush) {
        return;
      } else {
        Runtime._scheduledFlush = true;
      }
    }
    Runtime.isInFlush = true;
    if (!changed) {
      for (let funcs of Runtime._watch) {
        for (let func in funcs) {
          func[1].apply(func[0]);
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
          obj = Runtime._watch[k];
          for (let func of obj) {
            func[1].apply(func[0]);
          }
        }
      }
    }
    let watchers = Runtime.watchers;
    let func;
    for (let k in watchers) {
      if (onlySafe && k[0] === '_') {
        continue;
      }
      func = watchers[k];
      func.apply(element);
    }
    Runtime.isInFlush = false;
    if (Runtime._scheduledFlush === true) {
      Runtime._scheduledFlush = false;
      window.setTimeout(Runtime.flush, 20);
    }
    return Runtime;
  },

  apply(func, element = document) {
    var args, assoc, changed, changes, finalChanges, funcs, k, oldVal, old_values, v, val, _i, _j, _k, _len, _len1, _len2, _ref, _ref1, _ref2;
    if (Runtime.isInApply) {
      return func.call();
    }
    old_values = {};
    var association;
    for (let property in Runtime._watch)
    {
      funcs = Runtime._watch[property];
      old_values[property] = [];
      //Check if we are looking at an object property (starts with a lowercase)
      //or global property (starts with an uppercase)
      if (property[0].match(/^[^A-Z]/))
      {
        // association is an array of length 2 where first element is the object
        // and the second is the function on the object to execute when value
        // changes
        for (association of funcs)
        {
          //Get the current value
          val = Runtime.getPropByString(association[0], property);
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
        val = Runtime.getPropByString(window, property);
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
    Runtime.isInApply = true;
    // Execute the function
    func.call();
    // Clear mark
    Runtime.isInApply = false;

    // Compute the differences
    changes = {};
    _ref1 = Runtime._watch;
    for (k in _ref1) {
      funcs = _ref1[k];
      if (k[0].match(/^[^A-Z]/)) {
        changes[k] = [];
        for (_j = 0, _len1 = funcs.length; _j < _len1; _j++) {
          func = funcs[_j];
          if (k.match(/\.\*$/)) {
            changes[k].push(func);
          } else {
            val = Runtime.getPropByString(func[0], k);
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
        val = Runtime.getPropByString(window, k);
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
    return Runtime.flush(element, false, finalChanges);
  },

  // Walk through an object to get the specified property.
  // Nested properties are specified using '.' syntax
  // Function properties will be called and the result will be walked as well
  getPropByString(obj, propString)
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
        obj = obj.call(context);
      }
      if (obj === null || obj === void 0)
      {
        return null;
      }
    }
    return obj;
  },

  getValue(raw, propString, context = null) {
    var ctx;
    ctx = context ? context : propString.match(/^[A-Z]/) ? window : Runtime.getContext(raw);
    raw._rt_ctx = ctx;
    return Runtime.getPropByString(ctx, propString);
  },
  setPropByString(obj, propString, value) {
    var key, paths, prop, _i, _len, _ref, _ref1, ctx;
    if (!propString) {
      return obj;
    }
    paths = propString.split('.');
    key = paths[paths.length - 1];
    if (!obj.hasOwnProperty(paths[0]) && obj.hasOwnProperty('$ctrl'))
    {
      ctx = obj.$ctrl;
    } else {
      ctx = obj;
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
    ctx[prop] = value;
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
      ctx.$ctrl = Runtime.getContext($elm);
    }
    if (expr[0].match(/^[A-Z]/)) {
      ctx = window;
    }
    value = Runtime.getPropByString(ctx, expr);
    if (filter) {
      filter = filter.split(/:(.+)/);
      filterKey = filter ? filter[0] : null;
      filterOptions = filter && filter.length > 1 ? eval(filter[1]) : null;
      filter = filterKey ? Runtime.filters[filterKey] : null;
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
          if (Runtime.interpolationPattern.test(node.data)) {
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
      while((match = text.match(Runtime.interpolationPattern)) !== null)
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
        evald = fmt.replace('{{val}}', Runtime.evaluateExpression(expr, node, context));
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
      Runtime.compile(span, flush, context);
    }
  },

  addFilter(key, func) {
    Runtime.filters[key] = func;
  },
  addDirective(key, obj) {
    Runtime.directives[key] = obj;
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
        return Runtime.context;
      } else if (raw.nodeType !== 9 && raw.nodeType !== 3 && raw.dataset.controller) {
        constructor = raw.dataset.controller;
        if (typeof (_ref = constructor.match(/((?:\w|\.)+)(?:\((\w+)\))*/))[2] !== 'undefined')
        {
          model = Runtime.getValue(raw.parentNode,  _ref[2]);
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
          if (!Runtime._watch[k]) {
            Runtime._watch[k] = [];
          }
          Runtime._watch[k].push([ctrl, v]);
        }
        if (typeof ctrl.onLoad === "function") {
          ctrl.onLoad();
        }
        return ctrl;
      } else if (raw.parentElement) {
        raw = raw.parentElement;
      } else {
        return Runtime.context;
      }
    }
  },
  _show(element, expr, negate) {
    var $elm, ctx, isVisible;
    isVisible = true;
    if (expr.indexOf(Runtime.contextName) === 0) {
      isVisible = Runtime.getPropByString(Runtime.context, expr.substr(Runtime.contextName.length + 1));
    } else {
      $elm = element.constructor.name === "" ? element : $(element);
      if ((typeof (ctx = $elm[0]._rt_ctx)) !== "undefined") {
        isVisible = Runtime.getPropByString(ctx, expr);
      } else {
        ctx = Runtime.getContext($elm);
        $elm[0]._rt_ctx = ctx;
        isVisible = Runtime.getPropByString(ctx, expr);
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
    Runtime.apply(function()
    {
      var $elm, action, ctx, model, obj;
      $elm = $(element);
      ctx = Runtime.getContext($elm);
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
      if (ctx.hasOwnProperty(action) || typeof ctx[action] !== 'undefined') {
        return ctx[action].apply(ctx, [$elm, obj]);
      } else if (Runtime.context[action] != null) {
        return Runtime.context[action].apply(Runtime.ctx, [$elm, obj]);
      } else {
        return console.error("Unknown action '" + action + "' for " + $elm[0].outerHTML + " in " + ctx.constructor.name);
      }
    });
  },
  _model_get_val(raw)
  {
    var filter, filterKey, filterOptions, value, _ref;
    filter = (typeof (_ref = raw.dataset.filter)) !== "undefined" ? _ref.split(/:(.+)/) : void 0;
    filterKey = (filter ? filter[0] : null);
    if (filterKey && !Runtime.filters[filterKey]) {
      throw new Error("Unknown filter: '" + filterKey + "' for element: " + raw.outerHTML);
    }
    filterOptions = filter && filter.length > 1 ? eval(filter[1]) : null;
    filter = filterKey ? Runtime.filters[filterKey] : null;
    value = Runtime.getValue(raw, raw.dataset.model);
    if (filter && value != null) {
      return filter(value, filterOptions);
    } else {
      return value;
    }
  },
  compilers: {
    directives() {
      var k, obj, _ref, _results;
      _ref = Runtime.directives;
      _results = [];
      for (k in _ref) {
        obj = _ref[k];
        if (Runtime.directives.hasOwnProperty(k)) {
          _results.push($(k, this).each(function() {
            return $(this).replaceWith(obj.template);
          }));
        } else {
          _results.push(void 0);
        }
      }
      return _results;
    },
    "if": function() {
      return $('*[data-if]', this).each(function() {
        var $elm, comment, isVisible, negate, raw, val, _ref;
        isVisible = false;
        $elm = $(this);
        raw = val = $elm.data('if');
        negate = val[0] === '!';
        if (negate) {
          val = val.substr(1);
        }
        if (!Runtime._ifs[raw]) {
          Runtime._ifs[raw] = [];
        }
        isVisible = Runtime._show($elm, val, negate);
        if (isVisible) {
          Runtime._ifs[raw].push(this);
        } else {
          $('*[data-show]', $elm).each(function() {
            var $e, list, prop, _ref;
            $e = $(this);
            prop = $e.data('show');
            list = Runtime._shws[prop];
            Runtime._shws[prop] = (_ref = list != null ? list.filter(function(obj) {
              return !$(obj).is($e);
            }) : void 0) != null ? _ref : [];
          });
          $('*[data-controller]', $elm).each(function() {
            var $e, ctrl, k, list, _ref, _results;
            $e = $(this);
            ctrl = this._rt_ctrl;;
            _results = [];
            for (k in ctrl != null ? ctrl.watchers : void 0) {
              list = Runtime._watch[k];
              _results.push(Runtime._watch[k] = (_ref = list != null ? list.filter(function(obj) {
                return obj[0] !== ctrl;
              }) : void 0) != null ? _ref : []);
            }
            return _results;
          });
          comment = document.createComment(this.outerHTML);
          Runtime._ifs[raw].push(comment);
          $elm.replaceWith(comment);
          if ((_ref = Runtime.getContext($elm)) != null) {
            if (typeof _ref.onLoad === "function") {
              _ref.onLoad();
            }
          }
        }
        return null;
      });
    },
    show() {
      return $('*[data-show]', this).each(function() {
        var $elm, isVisible, negate, raw, val;
        $elm = $(this);
        raw = val = $elm.data('show');
        negate = val[0] === '!';
        if (negate) {
          val = val.substr(1);
        }
        if (!Runtime._shws[raw]) {
          Runtime._shws[raw] = [];
        }
        if (Runtime._shws[raw].some(function(obj) {
          return $(obj).is($elm);
        })) {
      return;
        }
        $elm.on('remove', function() {
          var list, _ref;
          list = Runtime._shws[raw];
          Runtime._shws[raw] = (_ref = list != null ? list.filter(function(obj) {
            return !$(obj).is($elm);
          }) : void 0) != null ? _ref : [];
        });
        isVisible = Runtime._show($elm, val, negate);
        Runtime._shws[raw].push(this);
        if (isVisible) {
          $elm.removeClass('hidden');
        } else {
          $elm.addClass('hidden');
        }
        return null;
      });
    },
    "class": function() {
      var raw = (this instanceof jQuery ? this[0] : this);
      var elements = raw.querySelectorAll('[data-class]');
      var element;
      var klass;

      if (raw.nodeType != 9 && raw.dataset.class)
      {
        raw.dataset._rt_hard_klass = raw.className;
        klass = Runtime.getValue(raw, raw.dataset.class);
        if (klass)
        {
          raw.classList.add(klass);
        }
      }

      for (let i = elements.length - 1; i >= 0; --i)
      {
        element = elements[i];
        element.dataset._rt_hard_klass = element.className;
        klass = Runtime.getValue(element, element.dataset.class);
        if (klass)
        {
          element.classList.add(klass);
        }
      }
    },

    style()
    {
      var raw = (this instanceof jQuery ? this[0] : this);
      var elements = raw.querySelectorAll('[data-style]');
      var element;
      for (let i = elements.length - 1; i >= 0; --i)
      {
        element = elements[i];
        element.setAttribute("style", Runtime.getValue(element, element.dataset.style));
      }
    },

    include() {
      return $('*[data-include]', this).each(function() {
        var $elm, partial;
        $elm = $(this);
        partial = eval($elm.data('include'));
        $elm.removeData('include');
        return $elm.load(partial, function() {
          var _ref;
          Runtime.compile($elm);
          return (_ref = Runtime.getContext($elm)) != null ? typeof _ref.onLoad === "function" ? _ref.onLoad() : void 0 : void 0;
        });
      });
    },
    controller() {
      return $('*[data-controller]', this).filter(function() {
        return !this._rt_live;
      }).each(function() {
      var $elm, constructor, ctrl, k, v, _ref, model;
      $elm = $(this);
      constructor = $elm.data('controller');
      if (typeof (_ref = constructor.match(/((?:\w|\.)+)(?:\((\w+)\))*/))[2] !== 'undefined')
      {
        model = Runtime.getValue($elm.parent()[0],  _ref[2]);
      }
      constructor = _ref[1];
      constructor = eval(constructor);
      if (!constructor) {
        return console.error("Unknown Controller: " + ($elm.data('controller')));
      }
      if (typeof model !== 'undefined')
      {
        ctrl = new constructor($elm, model);
      }
      else
      {
        ctrl = new constructor($elm);
      }
      $elm[0]._rt_live = true;
      _ref = constructor.watchers;
      for (k in _ref) {
        v = _ref[k];
        if (!Runtime._watch[k]) {
          Runtime._watch[k] = [];
        }
        Runtime._watch[k].push([ctrl, v]);
      }
      if (typeof ctrl.onLoad === "function") {
        ctrl.onLoad();
      }
      return null;
      });
    },
    click() {
      return $('*[data-click]', this).filter(function() {
        return !this._rt_live;
      }).each(function()
      {
        var $elm;
        $elm = $(this);
        $elm[0]._rt_live = true;
        $elm[0].onclick = function(evt) {
          Runtime._call(this, evt, 'click');
        };
      });
    },
    dblclick() {
      return $('*[data-dblclick]', this).filter(function() {
        return !this._rt_live;
      }).each(function()
      {
        var $elm;
        $elm = $(this);
        $elm[0]._rt_live = true;
        $elm[0].ondblclick = function(evt) {
          Runtime._call(this, evt, 'dblclick');
        };
      });
    },
    blur() {
      return $('*[data-blur]', this).filter(function() {
        return !this._rt_live;
      }).each(function() {
        var $elm;
        $elm = $(this);
        $elm[0]._rt_live = true;
        $elm[0].onblur = function(evt)
        {
          Runtime._call(this, evt, 'blur');
        };
      });
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
        return $elm.replaceWith(Runtime.compile($target));
      });
    },
    model(context = null) {
      $('input[data-model], select[data-model], textarea[data-model] option[data-model]', this).each(function() {
        var $elm, change, ctx, model, val;
        $elm = $(this);
        ctx = context != null ? context : Runtime.getContext($elm);
        model = $elm.data('model');
        let type = $elm.attr('type');
        if (type === 'text' || type === 'file' || type === 'number' ||
            type === 'email' || type === 'password') {
          $elm.val(Runtime.getValue($elm[0], model, ctx));
        } else if ($elm.attr('type') === 'radio') {
          val = $elm.val();
          if (val[0].match(/[0-9]/)) {
            val = parseInt(val);
          }
          $elm.prop('checked', Runtime.getValue($elm[0], model, ctx) === val);
        } else if ($elm.attr('type') === 'checkbox') {
          $elm.prop('checked', Runtime.getValue($elm[0], model, ctx));
        } else if ($elm[0].nodeName === 'OPTION') {
          $elm.prop('value', Runtime.getValue($elm[0], model, ctx));
        }
        change = function() {
          var obj, _ref, _ref1, _ref2;
          val = $elm.val();
          if ($elm.attr('type') === 'radio') {
            if (val[0].match(/[0-9]/)) {
              val = parseInt(val);
            }
          } else if ($elm.attr('type') === 'checkbox') {
            val = $elm.prop('checked');
          }
          if (Runtime.isInApply) {
            obj = (_ref = $elm[0]._rt_ctx) != null ? _ref : ctx;
            Runtime.setPropByString(obj, model, val);
          } else if ((_ref = $elm.data('trap')) != null) {
            obj = (_ref1 = $elm[0]._rt_ctx) != null ? _ref1 : ctx;
            let scope;
            if (_ref.toLowerCase() === "true")
            {
              scope = $elm;
            }
            else
            {
              scope = $(document);
              _ref1 = $elm;
              while ((_ref1 = _ref1.parent()) && _ref1.length)
              {
                if (_ref1.hasClass(_ref))
                {
                  scope = _ref1;
                  break;
                }
              }
            }
            Runtime.apply(function() {
              return Runtime.setPropByString(obj, model, val);
            }, scope);
          } else {
            obj = (_ref2 = $elm[0]._rt_ctx) != null ? _ref2 : ctx;
            Runtime.apply(function() {
              return Runtime.setPropByString(obj, model, val);
            });
          }
        };
        $elm[0].onchange = change;
        $elm[0].onkeyup = change;
        $elm[0].onsearch = change;
        if ($elm.attr('x-webkit-speech')) {
          $elm[0].onwebkitspeechchange = change;
        }
      });
    },
    submit() {
      $('*[data-submit]', this).each(function() {
        var $elm;
        $elm = $(this);
        $elm[0].onsubmit = function(evt)
        {
          Runtime._call(this, evt, 'submit');
        };
      });
    },
    repeat() {
      var elements = (this instanceof jQuery ? this[0] : this).querySelectorAll('[data-repeat]');
      let element;
      var $elm, child, children, ctx, expr, html, list, model, obj, repeat, template;
      let fragment;
      for (var i = elements.length - 1; i >= 0; i--)
      {
        raw = elements[i];
        repeat = raw.dataset.repeat.split(' in ');
        list = repeat[1];
        model = repeat[0];
        ctx = Runtime.getContext(raw);

        list = Runtime.getPropByString(ctx, list);
        listHash = SparkMD5.hash(JSON.stringify(list, function(key, value){
          if (key == '__elm' || key == '$ctrl')
          {
            return undefined;
          }
          return value;
        }));
        raw._rt_ctrl = ctx;
        raw._rt_repeat_list = listHash;

        template = raw._rt_repeat_template;
        template = Runtime.compile($(template), false, {})[0];
        raw._rt_repeat_template = template;

        if (list)
        {
          fragment = document.createDocumentFragment();
          let _i, _len, context, node;
          for (_i = 0, _len = list.length; _i < _len; _i++)
          {
            obj = list[_i];
            context = {};
            context[model] = obj;
            context.$ctrl = ctx;
            node = template.cloneNode(true);
            node._rt_ctx = context;
            Runtime.compilers.click.call(node);
            Runtime.compilers.dblclick.call(node);
            Runtime.compilers.blur.call(node);
            Runtime.compilers.model.call(node);
            obj.__elm = node;
            fragment.appendChild(node);
          }
          raw.appendChild(fragment);
        }
      }
    },

    src() {
      $('img[data-src]', this).each(function() {
        var $elm;
        $elm = $(this);
        $elm.attr('src', Runtime.getValue($elm[0], $elm.data('src')));
      });
    }
  },
  watchers: {
    _updateIf() {
      var comment, compiled, element, elements, i, isVisible, k, negate, raw, _i, _len, _ref;
      _ref = Runtime._ifs;
      for (k in _ref) {
        elements = _ref[k];
        if (Runtime._ifs.hasOwnProperty(k)) {
          raw = k;
          negate = k[0] === '!';
          if (negate) {
            k = k.substr(1);
          }
          for (i = _i = 0, _len = elements.length; _i < _len; i = ++_i) {
            element = elements[i];
            isVisible = Runtime._show($(element), k, negate);
            if (isVisible) {
              if (element.nodeType === 8) {
                compiled = Runtime.compile($(element.nodeValue), false);
                $(element).replaceWith(compiled);
                Runtime._ifs[raw][i] = compiled;
              }
            } else {
              if (element.nodeType !== 8) {
                $('*[data-show]', element).each(function() {
                  var $e, list, prop, _ref1;
                  $e = $(this);
                  prop = $e.data('show');
                  list = Runtime._shws[prop];
                  return Runtime._shws[prop] = (_ref1 = list != null ? list.filter(function(obj) {
                    return !$(obj).is($e);
                  }) : void 0) != null ? _ref1 : [];
                });
                $('*[data-controller]', element).each(function() {
                  var $e, ctrl, list, _ref1, _results;
                  $e = $(this);
                  ctrl = this._rt_ctrl;
                  _results = [];
                  for (k in ctrl != null ? ctrl.watchers : void 0) {
                    list = Runtime._watch[k];
                    _results.push(Runtime._watch[k] = (_ref1 = list != null ? list.filter(function(obj) {
                      return obj[0] !== ctrl;
                    }) : void 0) != null ? _ref1 : []);
                  }
                  return _results;
                });
                comment = document.createComment(($(element)[0]).outerHTML);
                Runtime._ifs[raw][i] = comment;
                $(element).replaceWith(comment);
              }
            }
          }
        }
      }
    },

    updateRepeat() {
      var $elm, changed, child, container, context, ctx, expr, html, list, model, newList, newListHash, obj, oldList, repeat, rt_model, template, _i, _len, _ref;
      var elements = (this instanceof jQuery ? this[0] : this).querySelectorAll('[data-repeat]');
      let raw, cache_display;
      for (let i = elements.length - 1; i >= 0; --i)
      {
        raw = elements[i];
        repeat = raw.dataset.repeat.split(' in ');
        list = repeat[1];
        model = repeat[0];
        ctx = Runtime.getContext(raw);

        newList = Runtime.getPropByString(ctx, list);
        newListHash = SparkMD5.hash(JSON.stringify(newList, function(key, value){
          if (key == '__elm' || key == '$ctrl')
          {
            return undefined;
          }
          return value;
        }));
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

        template = raw._rt_repeat_template;
        let count_diff = raw.childElementCount - newList.length;
        let existing = raw.childNodes;
        let node;

        while (count_diff > 0)
        {
          existing[count_diff-1].remove();
          --count_diff;
        }

        let fragment = document.createDocumentFragment();
        while (count_diff < 0)
        {
          context = {};
          context[model] = obj;
          context.$ctrl = ctx;
          child = template.cloneNode(true);
          child._rt_ctx = context;
          Runtime.compilers.click.call(child);
          Runtime.compilers.dblclick.call(child);
          Runtime.compilers.blur.call(child);
          Runtime.compilers.model.call(child);
          fragment.appendChild(child);
          ++count_diff;
        }
        raw.appendChild(fragment);

        for (_i = 0, _len = newList.length; _i < _len; _i++)
        {
          obj = newList[_i];
          node = existing[_i];
          node._rt_ctx[model] = obj;
        }
      }
    },

    updateShow() {
      var element, elements, i, isVisible, k, negate, raw, _i, _len, _ref;
      _ref = Runtime._shws;
      for (k in _ref) {
        elements = _ref[k];
        if (Runtime._shws.hasOwnProperty(k)) {
          raw = k;
          negate = k[0] === '!';
          if (negate) {
            k = k.substr(1);
          }
          for (i = _i = 0, _len = elements.length; _i < _len; i = ++_i) {
            element = elements[i];
            isVisible = Runtime._show($(element), k, negate);
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
        klass = Runtime.getValue(element, element.dataset.class);
        if (klass)
        {
          element.classList.add(klass);
        }
      }

    },

    updateStyle()
    {
      Runtime.compilers.style.call(this);
    },

    updateSrc() {
      return $('img[data-src]', $(this)).each(function() {
        var $elm, newSrc;
        $elm = $(this);
        newSrc = Runtime.getValue($elm[0], $elm.data('src'));
        if ($elm.attr('src') !== newSrc) {
          return $elm.attr('src', newSrc);
        }
      });
    },

    updateModel() {
      var raw = (this instanceof jQuery ? this[0] : this);
      var elements = raw.querySelectorAll('[data-model]');
      var element, i;
      for (i = elements.length - 1; i >= 0; --i)
      {
        element = elements[i];
        if (element.type === 'text')
        {
          element.value = Runtime._model_get_val(element);
        }
        else if (element.type === 'radio')
        {
          val = element.value;
          if (val.search(/[0-9]/) != -1) {
            val = parseInt(val);
          }
          element.checked = Runtime.getValue(element, element.dataset.model) === val;
        }
        else if (element.type === 'checkbox')
        {
          element.checked = Runtime.getValue(element, element.dataset.model);
        }
        else if (element.nodeName === 'SPAN')
        {
          element.innerHTML = Runtime._model_get_val(element);
        }
      }
    },
  }
};

Runtime.Controllers = Controllers;
window.Runtime = Runtime;
