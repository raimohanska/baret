import React from "react"
import {Observable} from "baconjs"
import {
  array0,
  assocPartialU,
  dissocPartialU,
  inherit,
  isArray,
  isString,
  object0
} from "infestines"

//

const STYLE = "style"
const CHILDREN = "children"
const BARET = "baret-lift"
const DD_REF = "$$ref"

//

const reactElement = React.createElement
const Component = React.Component

const isObs = x => x instanceof Observable

//

function LiftedComponent(props) {
  Component.call(this, props)
}

inherit(LiftedComponent, Component, {
  componentWillReceiveProps(nextProps) {
    this.doUnsubscribe()
    this.doSubscribe(nextProps)
  },
  componentWillMount() {
    this.doSubscribe(this.props)
  },
  componentWillUnmount() {
    this.doUnsubscribe()
  }
})

//

function FromBacon(props) {
  LiftedComponent.call(this, props)
  this.callback = null
  this.rendered = null
}

inherit(FromBacon, LiftedComponent, {
  doUnsubscribe() {
    if (this.unsub)
      this.unsub()
  },
  doSubscribe({observable}) {
    if (isObs(observable)) {
      const callback = e => {
        if (e.hasValue()) {
          this.rendered = e.value() || null
          this.forceUpdate()
        } else if (e.isError()) {
          throw e.error
        } else if (e.isEnd()) {
          this.unsub = null
        }
      }
      this.unsub = observable.subscribe(callback)
    } else {
      this.rendered = observable || null
    }
  },
  render() {
    return this.rendered
  }
})

export const fromBacon = observable => reactElement(FromBacon, {observable})

//

function forEach(props, extra, fn) {
  for (const key in props) {
    const val = props[key]
    if (isObs(val)) {
      fn(extra, val)
    } else if (CHILDREN === key) {
      if (isArray(val)) {
        for (let i=0, n=val.length; i<n; ++i) {
          const valI = val[i]
          if (isObs(valI))
            fn(extra, valI)
        }
      }
    } else if (STYLE === key) {
      for (const k in val) {
        const valK = val[k]
        if (isObs(valK))
          fn(extra, valK)
      }
    }
  }
}

function render(props, values) {
  let type = null
  let newProps = null
  let newChildren = null

  let k = -1

  for (const key in props) {
    const val = props[key]
    if (CHILDREN === key) {
      if (isObs(val)) {
        newChildren = values[++k]
      } else if (isArray(val)) {
        for (let i=0, n=val.length; i<n; ++i) {
          const valI = val[i]
          if (isObs(valI)) {
            if (!newChildren) {
              newChildren = Array(n)
              for (let j=0; j<i; ++j)
                newChildren[j] = val[j]
            }
            newChildren[i] = values[++k]
          } else if (newChildren)
            newChildren[i] = valI
        }
        if (!newChildren)
          newChildren = val
      } else {
        newChildren = val
      }
    } else if ("$$type" === key) {
      type = props[key]
    } else if (DD_REF === key) {
      newProps = newProps || {}
      newProps.ref = isObs(val) ? values[++k] : val
    } else if (isObs(val)) {
      newProps = newProps || {}
      newProps[key] = values[++k]
    } else if (STYLE === key) {
      let newStyle
      for (const i in val) {
        const valI = val[i]
        if (isObs(valI)) {
          if (!newStyle) {
            newStyle = {}
            for (const j in val) {
              if (j === i)
                break
              newStyle[j] = val[j]
            }
          }
          newStyle[i] = values[++k]
        } else if (newStyle) {
          newStyle[i] = valI
        }
      }
      newProps = newProps || {}
      newProps.style = newStyle || val
    } else {
      newProps = newProps || {}
      newProps[key] = val
    }
  }

  return newChildren instanceof Array
    ? reactElement.apply(null, [type, newProps].concat(newChildren))
    : newChildren
    ? reactElement(type, newProps, newChildren)
    : reactElement(type, newProps)
}

//

function incValues(self) { self.values += 1 }
function onAny1(handler, obs) { 
  handler.unsub = obs.subscribe(handler) 
}
function onAny(self, obs) {
  const handler = e => self.doHandleN(handler, e)
  self.handlers.push(handler)
  handler.unsub = obs.subscribe(handler)
}

function unsub(handler) {
  if (handler) {
    handler.unsub()
  }
}

function FromClass(props) {
  LiftedComponent.call(this, props)
  this.values = this
  this.handlers = null
}

inherit(FromClass, LiftedComponent, {
  doUnsubscribe() {
    const handlers = this.handlers
    if (handlers instanceof Function) {
      handlers.unsub()
    } else if (handlers) {
      handlers.forEach(unsub)
    }
  },
  doSubscribe(props) {
    this.values = 0
    forEach(props, this, incValues)
    const n = this.values // Here this.values contains the number of observable values. Later on, it'll contain the actual values.

    switch (n) {
      case 0:
        this.values = array0
        break
      case 1: {
        this.values = this
        const handlers = e => this.doHandle1(e)
        this.handlers = handlers
        forEach(props, handlers, onAny1)
        break
      }
      default:
        this.values = Array(n).fill(this)
        this.handlers = []
        forEach(props, this, onAny)
    }
  },
  doHandle1(e) {
    if (e.hasValue()) {
      const value = e.value()
      if (this.values !== value) {
        this.values = value
        this.forceUpdate()
      }
    } else if (e.isError()) {
      throw e.error
    } else { // Assume this is End
      this.values = [this.values]
      this.handlers = null
    }
  },
  doHandleN(handler, e) {
    const handlers = this.handlers
    let idx=0
    while (handlers[idx] !== handler)
      ++idx
    // Found the index of this handler/value
    if (e.hasValue()) {
      const value = e.value()
      const values = this.values
      if (values[idx] !== value) {
        values[idx] = value
        this.forceUpdate()
      }
    } else if (e.isError()) {
      throw e.error
    } else { // This is End
      handlers[idx] = null
      const n = handlers.length
      if (n !== this.values.length)
        return
      for (let i=0; i < n; ++i)
        if (handlers[i])
          return
      this.handlers = null // No handlers left -> nullify
    }
  },
  render() {
    if (this.handlers instanceof Function) {
      const value = this.values
      if (value === this)
        return null
      return render(this.props, [value])
    } else {
      const values = this.values
      for (let i=0, n=values.length; i<n; ++i)
        if (values[i] === this)
          return null
      return render(this.props, values)
    }
  }
})

//

function hasObsInProps(props) {
  for (const key in props) {
    const val = props[key]
    if (isObs(val)) {
      return true
    } else if (CHILDREN === key) {
      if (isArray(val))
        for (let i=0, n=val.length; i<n; ++i)
          if (isObs(val[i]))
            return true
    } else if (STYLE === key) {
      for (const k in val)
        if (isObs(val[k]))
          return true
    }
  }
  return false
}

function hasObsInArgs(args) {
  for (let i=2, n=args.length; i<n; ++i) {
    const arg = args[i]
    if (isArray(arg)) {
      for (let j=0, m=arg.length; j<m; ++j)
        if (isObs(arg[j]))
          return true
    } else if (isObs(arg)) {
      return true
    }
  }
  return hasObsInProps(args[1])
}

function filterProps(type, props) {
  const newProps = {"$$type": type}
  for (const key in props) {
    const val = props[key]
    if ("ref" === key)
      newProps[DD_REF] = val
    else if (BARET !== key)
      newProps[key] = val
  }
  return newProps
}

function hasLift(props) {
  return props && props[BARET] === true
}

function createElement(...args) {
  const type = args[0]
  const props = args[1]
  if (isString(type) || hasLift(props)) {
    if (hasObsInArgs(args)) {
      args[1] = filterProps(type, props)
      args[0] = FromClass
    } else if (hasLift(props)) {
      args[1] = dissocPartialU(BARET, props) || object0
    }
  }
  return reactElement(...args)
}

export default assocPartialU("createElement", createElement, React)

//

export const fromClass = Class => props =>
  reactElement(FromClass, filterProps(Class, props))
