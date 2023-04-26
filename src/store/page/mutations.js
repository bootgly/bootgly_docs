export const resetAnchor = (state) => {
  state.anchor = 0
}
export const setAnchor = (state, val) => {
  state.anchor = val
}

export const resetAnchors = (state) => {
  state.anchors = []
}
export const pushAnchors = (state, value) => {
  if (value === false) {
    state.anchors = []
  } else {
    // index: id
    state.anchors.push(value)
  }
}

export const resetNodes = (state) => {
  state.nodes = [
    {
      id: 0,
      children: []
    }
  ]
}
export const pushNodes = (state, node) => {
  const found = state.nodes[0].children.find(x => x.id === node.id)

  if (!found) {
    const value = {
      id: node.id,
      label: node.label,
      children: node.children
    }

    const children = state.nodes[0].children
    if (node.child && children.length) {
      children.at(-1).children.push(value)
    } else {
      state.nodes[0].children.push(value)
    }
  }
}
export const resetNodesExpanded = (state) => {
  state.nodesExpanded = [0]
}
export const pushNodesExpanded = (state, nodeId) => {
  state.nodesExpanded.push(nodeId)
}

export const setScrolling = (state, val) => {
  state.scrolling = val
}

export const setBase = (state, val) => {
  state.base = val
}
export const setRelative = (state, val) => {
  state.relative = val
}
export const setAbsolute = (state, val) => {
  state.absolute = val
}
