(function webpackUniversalModuleDefinition(root, factory) {
    if(typeof exports === 'object' && typeof module === 'object')
        module.exports = factory();
    else if(typeof define === 'function' && define.amd)
        define([], factory);
    else if(typeof exports === 'object')
        exports['Masked'] = factory();
    else
        root['Masked'] = factory();
})(window, function() {

    /**
     * Based on https://igorescobar.github.io/jQuery-Mask-Plugin/
     * @example new Masked(el, '099.099.099.099', {clearIfNotMatch: true})
     * pattern to validate ^([0-9]{1,3}\.){3}[0-9]{1,3}$
     */

    var globals = {
        keyStrokeCompensation: 10
        // old versions of chrome dont work great with input event
        , useInput: !/Chrome\/[2-4][0-9]|SamsungBrowser/.test(window.navigator.userAgent) && _eventSupported('input')
        , byPassKeys: [9, 16, 17, 18, 36, 37, 38, 39, 40, 91]
    };

    var defaults = {
        clearIfNotMatch: false
        , onChange: function() {}
        , onInput: function() {}
        , translation: {
            '0': {pattern: /\d/}
            , '9': {pattern: /\d/, optional: true}
            , '#': {pattern: /\d/, recursive: true}
            , 'A': {pattern: /[a-zA-Z0-9]/}
            , 'S': {pattern: /[a-zA-Z]/}
        }
    };

    function _eventSupported(eventName) {
        var el = document.createElement('div'), isSupported;

        eventName = 'on' + eventName;
        isSupported = (eventName in el);

        if ( !isSupported ) {
            el.setAttribute(eventName, 'return;');
            isSupported = typeof el[eventName] === 'function';
        }

        el = null;

        return isSupported;
    }

    function _getCaret(el) {
        try {
            var sel;
            var pos = 0;
            var dSel = document.selection;
            var cSelStart = el.selectionStart;

            // IE Support
            if (dSel && navigator.appVersion.indexOf('MSIE 10') === -1) {
                sel = dSel.createRange();
                sel.moveStart('character', _getValue(el).length);
                pos = sel.text.length;
            }

            // Firefox support
            else if (cSelStart || cSelStart === '0') {
                pos = cSelStart;
            }

            return pos;
        } catch (e) {
            return 0;
        }
    }

    function _setCaret(el, pos) {
        try {
            if (_isFocused(el)) {
                var range;

                // Firefox, WebKit, etc..
                if (el.setSelectionRange) {
                    el.setSelectionRange(pos, pos);
                } else { // IE
                    range = el.createTextRange();
                    range.collapse(true);
                    range.moveEnd('character', pos);
                    range.moveStart('character', pos);
                    range.select();
                }
            }
        } catch (e) {}
    }

    function _setData(el, key, value) {
        var attr = 'data-' + key.toLowerCase();
        el.setAttribute(attr, String(value));
    }

    function _getData(el, key) {
        var attr = 'data-' + key.toLowerCase();
        var attributes = el.attributes;
        return attr in attributes ? attributes[attr].value : null;
    }

    function _isFocused(el) {
        return document.activeElement === el && ( el.type || el.href );
    }

    function _getValue(el) {
        return el.value;
    }

    function _setValue(el, v) {
        if(_getValue(el) !== v) {
            el.value = v;
        }
    }

    function _result(val) {
        return 'function' === typeof val ? val() : val;
    }

    function Masked(el, mask, options) {
        options = options || {};

        this.el = el;
        this.mask = mask;

        this.options = Object.assign({}, defaults, options);
        this.options.translation = Object.assign({}, defaults.translation, options.translation || {});

        this._oldValue = _getValue(el);
        this._invalid = [];
        this._maskDigitPosMap = {};
        this._maskDigitPosMapOld = {};
        this._regexMask = this._getRegexMask();

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onInput = this._onInput.bind(this);
        this._onBlur = this._onBlur.bind(this);
        this._onFocusOut = this._onFocusOut.bind(this);

        this._init();
    }

    var _p = Masked.prototype;

    /**
     * @public
     * @return {string}
     */
    _p.getMasked = function() {
        var buf = [];
        var mask = _result(this.mask);
        var value = _getValue(this.el);
        var m = 0;
        var maskLen = mask.length;
        var v = 0;
        var valLen = value.length;
        var offset = 1, addMethod = 'push';
        var resetPos = -1;
        var maskDigitCount = 0;
        var maskDigitPosArr = [];
        var lastMaskChar = maskLen - 1;
        var check = function () {
            return m < maskLen && v < valLen;
        };
        var translation = this.options.translation;
        var lastUntranslatedMaskChar;

        while (check()) {
            var maskDigit = mask.charAt(m);
            var valDigit = value.charAt(v);
            var tr = translation[maskDigit];

            if (tr) {

                if (valDigit.match(tr.pattern)) {
                    buf[addMethod](valDigit);
                    if (tr.recursive) {
                        if (resetPos === -1) {
                            resetPos = m;
                        } else if (m === lastMaskChar && m !== resetPos) {
                            m = resetPos - offset;
                        }

                        if (lastMaskChar === resetPos) {
                            m -= offset;
                        }
                    }
                    m += offset;
                } else if (valDigit === lastUntranslatedMaskChar) {
                    // matched the last untranslated (raw) mask character that we encountered
                    // likely an insert offset the mask character from the last entry; fall
                    // through and only increment v
                    maskDigitCount--;
                    lastUntranslatedMaskChar = undefined;
                } else if (tr.optional) {
                    m += offset;
                    v -= offset;
                } else if (tr.fallback) {
                    buf[addMethod](tr.fallback);
                    m += offset;
                    v -= offset;
                } else {
                    this._invalid.push({p: v, v: valDigit, e: tr.pattern});
                }

                v += offset;

            } else {

                buf[addMethod](maskDigit);

                if (valDigit === maskDigit) {
                    maskDigitPosArr.push(v);
                    v += offset;
                } else {
                    lastUntranslatedMaskChar = maskDigit;
                    maskDigitPosArr.push(v + maskDigitCount);
                    maskDigitCount++;
                }

                m += offset;

            }
        }

        var lastMaskCharDigit = mask.charAt(lastMaskChar);

        if (maskLen === valLen + 1 && !translation[lastMaskCharDigit]) {
            buf.push(lastMaskCharDigit);
        }

        var newVal = buf.join('');

        this._mapMaskdigitPositions(newVal, maskDigitPosArr, valLen);

        return newVal;
    };

    _p._init = function() {
        var el = this.el;
        var mask = _result(this.mask);
        var translation = this.options.translation;

        // this is necessary, otherwise if the user submit the form
        // and then press the "back" button, the autocomplete will erase
        // the data. Works fine on IE9+, FF, Opera, Safari.
        if(_getData(el, 'mask')) {
            el.setAttribute('autocomplete', 'off');
        }

        // detect if is necessary let the user type freely.
        // for is a lot faster than forEach.
        for (var i = 0, maxlength = true; i < mask.length; i++) {
            var tr = translation[mask.charAt(i)];
            if (tr && tr.recursive) {
                maxlength = false;
                break;
            }
        }

        if (maxlength) {
            el.setAttribute('maxlength', mask.length);
            _setData(el, 'mask-maxlength', true);
        }

        // p.destroyEvents();

        this._bindEvents();

        var caret = _getCaret(el);

        _setValue(el, this.getMasked());

        _setCaret(el, caret);

    };

    _p._bindEvents = function() {
        var el = this.el;

        el.addEventListener('keydown', this._onKeyDown);

        el.addEventListener(globals.useInput ? 'input' : 'keyup', this._onInput);

        el.addEventListener('focusout', this._onFocusOut);
    };

    _p._onKeyDown = function(e) {
        var el = this.el;
        _setData(el, 'mask-keycode', e.keyCode || e.which);
        _setData(el, 'mask-previus-value', _getValue(el));
        _setData(el, 'mask-previus-caret-pos', _getCaret(el));
        this._maskDigitPosMapOld = this._maskDigitPosMap;
    };

    _p._onInput = function(e) {
        e = e || window.event;

        var el = this.el;
        var keyCode = Number(_getData(el, 'mask-keycode'));

        this._invalid = [];

        if (globals.byPassKeys.indexOf(keyCode) < 0) {
            var newVal = this.getMasked();
            var caretPos = _getCaret(el);

            // this is a compensation to devices/browsers that don't compensate
            // caret positioning the right way
            setTimeout(function() {
                _setCaret(el, this._calculateCaretPosition());
            }.bind(this), globals.keyStrokeCompensation);

            _setValue(el, newVal);
            _setCaret(el, caretPos);

            this._callback('onInput', e);
        }
    };

    _p._callback = function(name, e) {
        var options = this.options;
        if (typeof options[name] === 'function') {
            options[name].apply(this, [_getValue(this.el), e, this.el, options]);
        }
    };

    _p._onBlur = function() {
        this._oldValue = _getValue(this.el);
    };

    _p._onFocusOut = function() {
        var el = this.el;
        if(this.options.clearIfNotMatch && !this._regexMask.test(_getValue(el))) {
            _setValue(el, '');
        }
    };

    _p._mapMaskdigitPositions = function(newVal, maskDigitPosArr) {
        var maskDiff = 0;
        this._maskDigitPosMap = {};
        for (var i = 0; i < maskDigitPosArr.length; i++) {
            this._maskDigitPosMap[maskDigitPosArr[i] + maskDiff] = 1;
        }
    };

    _p._getRegexMask = function() {
        var mask = _result(this.mask);
        var translation = this.options.translation;
        var maskChunks = [];
        var tr;
        var pattern;
        var optional;
        var recursive;
        var oRecursive;

        for (var i = 0; i < mask.length; i++) {
            tr = translation[mask.charAt(i)];

            if (tr) {

                pattern = tr.pattern.toString().replace(/.{1}$|^.{1}/g, '');
                optional = tr.optional;
                recursive = tr.recursive;

                if (recursive) {
                    maskChunks.push(mask.charAt(i));
                    oRecursive = {digit: mask.charAt(i), pattern: pattern};
                } else {
                    maskChunks.push(!optional && !recursive ? pattern : (pattern + '?'));
                }

            } else {
                maskChunks.push(mask.charAt(i).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
            }
        }

        var r = maskChunks.join('');

        if (oRecursive) {
            r = r.replace(new RegExp('(' + oRecursive.digit + '(.*' + oRecursive.digit + ')?)'), '($1)?')
                .replace(new RegExp(oRecursive.digit, 'g'), oRecursive.pattern);
        }

        return new RegExp(r);
    };

    _p._calculateCaretPosition = function() {
        var el = this.el;
        var oldVal = _getData(el, 'mask-previus-value') || '';
        var newVal = this.getMasked();
        var caretPosNew = _getCaret(el);
        var maskDigitPosMap = this._maskDigitPosMap;
        var maskDigitPosMapOld = this._maskDigitPosMapOld;

        if (oldVal !== newVal) {
            var caretPosOld = Number(_getData(el, 'mask-previus-caret-pos') || 0),
                newValL = newVal.length,
                oldValL = oldVal.length,
                maskDigitsBeforeCaret = 0,
                maskDigitsAfterCaret = 0,
                maskDigitsBeforeCaretAll = 0,
                maskDigitsBeforeCaretAllOld = 0,
                i = 0;

            for (i = caretPosNew; i < newValL; i++) {
                if (!maskDigitPosMap[i]) {
                    break;
                }
                maskDigitsAfterCaret++;
            }

            for (i = caretPosNew - 1; i >= 0; i--) {
                if (!maskDigitPosMap[i]) {
                    break;
                }
                maskDigitsBeforeCaret++;
            }

            for (i = caretPosNew - 1; i >= 0; i--) {
                if (maskDigitPosMap[i]) {
                    maskDigitsBeforeCaretAll++;
                }
            }

            for (i = caretPosOld - 1; i >= 0; i--) {
                if (maskDigitPosMapOld[i]) {
                    maskDigitsBeforeCaretAllOld++;
                }
            }

            // if the cursor is at the end keep it there
            if (caretPosNew > oldValL) {
                caretPosNew = newValL * 10;
            } else if (caretPosOld >= caretPosNew && caretPosOld !== oldValL) {
                if (maskDigitPosMapOld[caretPosNew])  {
                    var caretPos = caretPosNew;
                    caretPosNew -= maskDigitsBeforeCaretAllOld - maskDigitsBeforeCaretAll;
                    caretPosNew -= maskDigitsBeforeCaret;
                    if (maskDigitPosMap[caretPosNew])  {
                        caretPosNew = caretPos;
                    }
                }
            } else if (caretPosNew > caretPosOld) {
                caretPosNew += maskDigitsBeforeCaretAll - maskDigitsBeforeCaretAllOld;
                caretPosNew += maskDigitsAfterCaret;
            }
        }

        return caretPosNew;
    };

    Masked.MASK_IPV4 = '099.099.099.099';
    Masked.MASK_TIME = '00:00:00';

    return Masked;

});