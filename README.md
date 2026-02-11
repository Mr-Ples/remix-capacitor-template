# Remix + Capacitor!

This is a basic example of a remix app (With SPA mode) running with capacitor.

Install dependencies

```
npm install
```

Run dev command to see your page on a web navigator

```
npm run dev
```

Generate android and ios app directory

```
npx cap add android
npx cap add ios
```

Use the build command to generate your web into `build/client` and also sync the changes with your mobile app

```
npm run build
```

Use this to run the app on your Android device:
```
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
export PATH=$JAVA_HOME/bin:$PATH
unset ANDROID_SDK_ROOT # needed if you have multiple android sdks installed
npx cap run android
```

Don't forget to change `capacitor.config.ts`

For more information you can see the [Capacitor documentation](https://capacitorjs.com/docs/getting-started)
