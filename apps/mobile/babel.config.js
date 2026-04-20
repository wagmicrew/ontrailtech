const path = require('path');

function expoRouterEnvPatchPlugin(api) {
  const t = api.types;

  return {
    name: 'ontrail-expo-router-env-patch',
    visitor: {
      MemberExpression(memberPath, state) {
        const object = memberPath.node.object;
        if (!t.isMemberExpression(object)) {
          return;
        }

        if (!t.isIdentifier(object.object, { name: 'process' })) {
          return;
        }

        if (!t.isIdentifier(object.property, { name: 'env' })) {
          return;
        }

        const property = memberPath.toComputedKey();
        if (!t.isStringLiteral(property)) {
          return;
        }

        if (property.value === 'EXPO_ROUTER_APP_ROOT') {
          const filename = state.filename || state.file?.opts?.filename;
          if (!filename) {
            return;
          }

          const appRoot = path.join(__dirname, 'app');
          const relativeAppRoot = path.relative(path.dirname(filename), appRoot) || '.';
          memberPath.replaceWith(t.stringLiteral(relativeAppRoot));
          return;
        }

        if (property.value === 'EXPO_ROUTER_IMPORT_MODE') {
          memberPath.replaceWith(t.stringLiteral('sync'));
        }
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [expoRouterEnvPatchPlugin],
  };
};