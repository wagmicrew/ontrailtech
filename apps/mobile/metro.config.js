const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

function resolvePackagePath(packageName, packageSubpath = '') {
	const localPath = path.resolve(projectRoot, 'node_modules', packageName, packageSubpath);
	if (fs.existsSync(localPath)) {
		return localPath;
	}

	return path.resolve(workspaceRoot, 'node_modules', packageName, packageSubpath);
}

config.resolver.disableHierarchicalLookup = true;

config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, 'node_modules'),
	path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.extraNodeModules = {
	...config.resolver.extraNodeModules,
	react: resolvePackagePath('react'),
	'react-dom': resolvePackagePath('react-dom'),
	'react-native': resolvePackagePath('react-native'),
	'@react-native/virtualized-lists': resolvePackagePath('@react-native', 'virtualized-lists'),
	'react/jsx-runtime': resolvePackagePath('react', 'jsx-runtime.js'),
	'react/jsx-dev-runtime': resolvePackagePath('react', 'jsx-dev-runtime.js'),
};

module.exports = config;