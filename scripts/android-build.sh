export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
export PATH=$JAVA_HOME/bin:$PATH
unset ANDROID_SDK_ROOT # needed if you have multiple android sdks installed
npx cap add android
npx @capacitor/assets generate
npm run build
npx cap sync
npx cap run android --target dbf9c54c