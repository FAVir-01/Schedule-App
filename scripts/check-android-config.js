// Falha cedo quando a identidade ou a versão Android divergem entre Expo,
// projeto nativo e EAS. Não acessa credenciais nem serviços externos.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');
const extract = (contents, pattern, label) => {
  const match = contents.match(pattern);
  if (!match) {
    throw new Error(`Não foi possível localizar ${label}.`);
  }
  return match[1];
};

const appConfig = JSON.parse(read('app.json'));
const easConfig = JSON.parse(read('eas.json'));
const gradle = read('android/app/build.gradle');
const stringsXml = read('android/app/src/main/res/values/strings.xml');
const mainManifest = read('android/app/src/main/AndroidManifest.xml');
const debugManifest = read('android/app/src/debug/AndroidManifest.xml');
const mainActivity = read('android/app/src/main/java/com/favit/MainActivity.kt');
const mainApplication = read('android/app/src/main/java/com/favit/MainApplication.kt');

const expo = appConfig.expo ?? {};
const android = expo.android ?? {};
const native = {
  applicationId: extract(gradle, /\bapplicationId\s+["']([^"']+)["']/, 'applicationId'),
  namespace: extract(gradle, /\bnamespace\s+["']([^"']+)["']/, 'namespace'),
  versionCode: Number(extract(gradle, /\bversionCode\s+(\d+)/, 'versionCode')),
  versionName: extract(gradle, /\bversionName\s+["']([^"']+)["']/, 'versionName'),
  runtimeVersion: extract(
    stringsXml,
    /<string\s+name=["']expo_runtime_version["']>([^<]+)<\/string>/,
    'expo_runtime_version'
  ),
};

const errors = [];
const expectEqual = (label, left, right) => {
  if (left !== right) {
    errors.push(`${label}: ${JSON.stringify(left)} != ${JSON.stringify(right)}`);
  }
};

expectEqual('Expo package x applicationId', android.package, native.applicationId);
expectEqual('namespace x applicationId', native.namespace, native.applicationId);
expectEqual('Expo version x versionName', expo.version, native.versionName);
expectEqual('Expo versionCode x versionCode nativo', android.versionCode, native.versionCode);
expectEqual('Expo runtimeVersion x runtime nativo', expo.runtimeVersion, native.runtimeVersion);
expectEqual(
  'Pacote de MainActivity',
  extract(mainActivity, /^package\s+([^\s]+)$/m, 'pacote de MainActivity'),
  native.namespace
);
expectEqual(
  'Pacote de MainApplication',
  extract(mainApplication, /^package\s+([^\s]+)$/m, 'pacote de MainApplication'),
  native.namespace
);

if (easConfig.cli?.appVersionSource !== 'remote') {
  errors.push('EAS deve usar cli.appVersionSource="remote".');
}
if (easConfig.build?.production?.autoIncrement !== true) {
  errors.push('O perfil production deve usar autoIncrement=true.');
}
if (easConfig.build?.production?.credentialsSource !== 'remote') {
  errors.push('O perfil production deve usar credentialsSource="remote".');
}
if (easConfig.build?.production?.android?.buildType !== 'app-bundle') {
  errors.push('O perfil production deve gerar Android App Bundle.');
}
if (easConfig.build?.production_apk?.credentialsSource !== 'remote') {
  errors.push('O perfil production_apk deve usar credentialsSource="remote".');
}
if (/release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/.test(gradle)) {
  errors.push('O build release não pode usar signingConfigs.debug.');
}

const blockedPermissions = new Set(android.blockedPermissions ?? []);
const releaseBlockedPermissions = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
];

releaseBlockedPermissions.forEach((permission) => {
  if (!blockedPermissions.has(permission)) {
    errors.push(`Expo deve bloquear ${permission} no manifest final.`);
  }

  const escapedPermission = permission.replaceAll('.', '\\.');
  const removalPattern = new RegExp(
    `<uses-permission\\s+android:name=["']${escapedPermission}["'][^>]*tools:node=["']remove["'][^>]*/?>`
  );
  if (!removalPattern.test(mainManifest)) {
    errors.push(`Manifest principal deve remover ${permission}.`);
  }
});

if (
  !/<uses-permission\s+android:name=["']android\.permission\.SYSTEM_ALERT_WINDOW["'][^>]*tools:node=["']replace["'][^>]*\/?>/.test(
    debugManifest
  )
) {
  errors.push('SYSTEM_ALERT_WINDOW deve ficar restrita ao manifest de debug.');
}

if (errors.length > 0) {
  console.error('Configuração Android inconsistente:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(
    `Android OK: ${native.applicationId} ${native.versionName} (${native.versionCode}), ` +
      'release com credenciais remotas.'
  );
}
