// Falha cedo quando a identidade ou a versão Android divergem entre Expo,
// projeto nativo e EAS. Não acessa credenciais nem serviços externos.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');
const escapeRegExp = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
const stylesXml = read('android/app/src/main/res/values/styles.xml');
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
  appName: extract(
    stringsXml,
    /<string\s+name=["']app_name["']>([^<]+)<\/string>/,
    'app_name'
  ),
  mainActivityTag: extract(
    mainManifest,
    /(<activity\b[^>]*android:name=["']\.MainActivity["'][^>]*>)/,
    'tag de MainActivity'
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
expectEqual('Nome Expo x app_name nativo', expo.name, native.appName);
expectEqual(
  'Pacote de MainActivity',
  extract(mainActivity, /^package\s+([^\s]+)$/m, 'pacote de MainActivity'),
  native.namespace
);

if (
  !/override\s+fun\s+onUserLeaveHint\s*\(\s*\)[\s\S]*?BuildConfig\.DEBUG\s*&&\s*reactDelegate\s*==\s*null[\s\S]*?return[\s\S]*?super\.onUserLeaveHint\s*\(\s*\)/.test(
    mainActivity
  )
) {
  errors.push('MainActivity deve proteger onUserLeaveHint enquanto o delegate de debug não estiver pronto.');
}

const applicationTag = extract(
  mainManifest,
  /(<application\b[^>]*>)/,
  'tag de application'
);
if (!/android:label=["']@string\/app_name["']/.test(applicationTag)) {
  errors.push('Application deve usar @string/app_name como label.');
}
if (!/android:icon=["']@mipmap\/ic_launcher["']/.test(applicationTag)) {
  errors.push('Application deve usar @mipmap/ic_launcher como ícone.');
}
if (!/android:roundIcon=["']@mipmap\/ic_launcher_round["']/.test(applicationTag)) {
  errors.push('Application deve usar @mipmap/ic_launcher_round como ícone redondo.');
}

if (expo.orientation === 'portrait' && !/android:screenOrientation=["']portrait["']/.test(native.mainActivityTag)) {
  errors.push('MainActivity deve manter screenOrientation="portrait".');
}
if (expo.userInterfaceStyle === 'automatic' && !/Theme\.AppCompat\.DayNight\./.test(stylesXml)) {
  errors.push('AppTheme deve herdar de um tema DayNight para userInterfaceStyle="automatic".');
}

if (!expo.scheme) {
  errors.push('Expo deve declarar um scheme para deep links.');
} else {
  const schemePattern = new RegExp(
    `<data\\s+[^>]*android:scheme=["']${escapeRegExp(expo.scheme)}["'][^>]*/?>`
  );
  if (!schemePattern.test(mainManifest)) {
    errors.push(`Manifest principal deve registrar o scheme ${expo.scheme}://.`);
  }
}

const nativeUpdateUrl = extract(
  mainManifest,
  /<meta-data\s+android:name=["']expo\.modules\.updates\.EXPO_UPDATE_URL["']\s+android:value=["']([^"']+)["']\s*\/>/,
  'EXPO_UPDATE_URL'
);
expectEqual('Expo updates.url x URL nativa', expo.updates?.url, nativeUpdateUrl);

const validateSquarePng = (label, configuredPath) => {
  if (!configuredPath) {
    errors.push(`${label} não foi configurado.`);
    return;
  }

  const absolutePath = path.resolve(root, configuredPath);
  if (!absolutePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(absolutePath)) {
    errors.push(`${label} aponta para um arquivo ausente ou fora do projeto.`);
    return;
  }

  const image = fs.readFileSync(absolutePath);
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (image.length < 24 || !image.subarray(0, 8).equals(pngSignature)) {
    errors.push(`${label} deve ser um PNG real.`);
    return;
  }

  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (width !== height) {
    errors.push(`${label} deve ser quadrado; recebido ${width}x${height}.`);
  }
};

validateSquarePng('Ícone principal', expo.icon);
validateSquarePng('Ícone adaptativo', android.adaptiveIcon?.foregroundImage);
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
