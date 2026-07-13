
# Schedule App

## Fluxo de desenvolvimento

### 1. Ver mudanças no Android Studio

Abra a pasta `schedule-app` no Android Studio.

- `View > Tool Windows > Commit`: mostra arquivos modificados e não rastreados
- `Git > Show History`: histórico por arquivo
- `Git > Show Git Log`: histórico geral do projeto

Arquivos como `.idea/` e `.expo/` são locais e não devem ir para o repositório.

### 2. Rodar no aparelho virtual

Pré-requisitos:

- Android Studio com um emulador criado
- Node.js instalado
- Dependências instaladas com `npm install`

Com o emulador aberto:

```bash
npm run android
```

Para iniciar o servidor Metro separadamente:

```bash
npm run start
```

Se estiver usando development build:

```bash
npm run start:dev
```

### 3. Atualizar o app já instalado no celular

Este projeto já usa `expo-updates` e EAS Update.

Você pode publicar update OTA quando a mudança envolver apenas:

- JavaScript / React Native
- imagens, fontes e outros assets empacotados
- lógica de tela e comportamento do app

Publique em produção com:

```bash
npm run update:production
```

Publique em preview com:

```bash
npm run update:preview
```

### 4. Quando OTA não basta

Você precisa gerar uma nova build APK/AAB quando mudar:

- código nativo Android
- permissões nativas
- dependências nativas
- `android/`
- `app.json` em partes que afetam runtime nativo
- `runtimeVersion`

Nesses casos, faça nova build com EAS ou rode nova instalação local no aparelho/emulador.

### 5. Regra prática

- Mudou tela, estado, cálculo, texto, asset: tente `eas update`
- Mudou algo nativo ou pacote nativo: gere nova build

## Release Android

A identidade Android canônica é `com.favit`. Builds de desenvolvimento locais usam
`com.favit.dev` por causa do sufixo configurado no Gradle. O identificador iOS é
independente e continua `com.favit.schedule`.

Antes de iniciar uma build de produção:

1. Execute `npm run check:android-config` para confirmar pacote, namespace, versão,
   runtime e perfil EAS.
2. Execute `eas credentials -p android` e confirme que as credenciais remotas pertencem
   a `com.favit`. Se o app já existir no Google Play, reutilize obrigatoriamente a chave
   de upload correspondente; nunca gere outra sem verificar a continuidade da assinatura.
3. Confirme no EAS que o código remoto é maior que o último código publicado. Use
   `eas build:version:set -p android` para inicializar/corrigir a origem remota quando
   necessário.
4. Gere o AAB com `eas build --platform android --profile production` e valide no
   artefato final o pacote `com.favit`, o código de versão, a assinatura e o canal
   `production` antes do envio à loja.

O repositório não contém chave de produção. O EAS injeta a credencial remota no build;
um `bundleRelease` local fica sem assinatura até que uma chave de upload seja configurada
fora do Git. A instalação `com.favit` registrada no emulador foi gerada quando o release
usava a chave de debug. Uma build assinada com a chave real não poderá atualizá-la por
cima; preserve os dados e confirme a estratégia de migração antes de desinstalar.
