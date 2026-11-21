const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// src/icons.ts imports each lucide icon from its own module instead of the
// barrel (which pulls in ~1,700 icons). Those per-icon files aren't listed in
// the package's "exports", so resolve them directly to their files.
const LUCIDE_ICONS = "lucide-react-native/dist/esm/icons/";
// (via the main entry: the package doesn't export ./package.json)
const lucideIconsDir = path.resolve(path.dirname(require.resolve("lucide-react-native")), "../esm/icons");
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName.startsWith(LUCIDE_ICONS)) {
        return { type: "sourceFile", filePath: path.join(lucideIconsDir, moduleName.slice(LUCIDE_ICONS.length)) };
    }
    return upstreamResolve
        ? upstreamResolve(context, moduleName, platform)
        : context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
