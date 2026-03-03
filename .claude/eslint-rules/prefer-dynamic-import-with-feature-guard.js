/**
 * ESLint rule: prefer-dynamic-import-with-feature-guard
 *
 * Warns when a file has both static non-framework imports and a browser feature
 * detection guard (e.g. `if (!navigator.xxx) return`), which suggests the
 * import should be dynamic to avoid loading the module when the feature is unavailable.
 */

const FRAMEWORK_PACKAGES = /^(react|react-dom|next|next-cloudinary|nextra)($|\/)/

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer dynamic imports when the module is only used inside a browser feature guard.',
    },
    messages: {
      preferDynamic:
        'Static import "{{ source }}" may be loaded unnecessarily. ' +
        'Consider a dynamic import inside the feature guard (e.g. `if (!navigator.xxx) return`).',
    },
  },

  create(context) {
    const projectImports = []
    let hasNavigatorGuard = false

    function isNavigatorGuard(node) {
      // Matches: !navigator.foo or !navigator?.foo
      if (node.type !== 'UnaryExpression' || node.operator !== '!') return false
      const arg = node.argument
      if (arg.type === 'MemberExpression') {
        return arg.object?.name === 'navigator'
      }
      if (arg.type === 'ChainExpression') {
        return arg.expression?.object?.name === 'navigator'
      }
      return false
    }

    return {
      ImportDeclaration(node) {
        if (!FRAMEWORK_PACKAGES.test(node.source.value)) {
          projectImports.push(node)
        }
      },

      IfStatement(node) {
        if (isNavigatorGuard(node.test)) {
          hasNavigatorGuard = true
        }
      },

      'Program:exit'() {
        if (hasNavigatorGuard && projectImports.length > 0) {
          projectImports.forEach((imp) => {
            context.report({
              node: imp,
              messageId: 'preferDynamic',
              data: { source: imp.source.value },
            })
          })
        }
      },
    }
  },
}
