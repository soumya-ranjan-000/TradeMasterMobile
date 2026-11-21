// Per-icon modules of lucide-react-native (see src/icons.ts). The package's
// "exports" map doesn't list them, so their type is declared here.
declare module 'lucide-react-native/dist/esm/icons/*' {
    import type { LucideIcon } from 'lucide-react-native';
    const Icon: LucideIcon;
    export default Icon;
}
