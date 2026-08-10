// ESLint yapılandırması (flat config).
//
// tsconfig zaten sıkı (strict, noUnusedLocals, noUnusedParameters), bu yüzden
// tip denetiminin yakaladığı şeyleri burada tekrarlamıyoruz. Buradaki kurallar
// derleyicinin *göremediği* şeyler için: hook bağımlılıkları, yutulan promise'ler
// ve projeye özel iki yasak (alert/confirm/prompt ve ham `any`).
//
// Tip bilgisi gerektiren kurallar açık (projectService): "yüzen promise"
// hatalarını ancak böyle görebiliyoruz — bu projede en çok canımızı yakan
// hata sınıfı `void` unutulmuş async çağrılar oldu.

import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },

  // Tarayıcıda çalışan uygulama kodu
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Kurallı yasaklar (CLAUDE.md): tarayıcının kendi kutuları kullanılmıyor,
      // ConfirmDialog var. `no-alert` üçünü birden kapatıyor.
      'no-alert': 'error',

      /*
        Aynı anahtarın sözlüğe iki kez yazılması. sozluk.ts 500 satır ve
        anahtarlar uzun Türkçe cümleler; gözle yakalanmıyor. İkincisi sessizce
        kazandığı için hata da vermiyordu — bir kez başımıza geldi.
        TypeScript bunu Record<string, string> altında yakalamıyor.
      */
      'no-dupe-keys': 'error',

      // Yutulan promise. `void sözVeren()` yazmak serbest, sessizce bırakmak değil.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        // onClick={async () => …} React'te yaygın ve zararsız; asıl istediğimiz
        // koşul/mantık içinde promise kullanılmasını yakalamak.
        { checksVoidReturn: { attributes: false } },
      ],

      // Aşağıdakiler uyarı: mevcut kodda çok sayıda örneği var ve hiçbiri
      // hata değil. Yeni kodda görünür olsunlar diye açık, ama `lint`
      // komutunu kırmasınlar diye uyarı seviyesinde.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/require-await': 'warn',

      /*
        Kapalı — ve `--fix` ile açılmasın.

        Supabase istemcisi tip üretmeden kullanıldığı için sorgu sonuçları
        `any`. Kural bu değerlerdeki `as { user_id: string }` gibi daraltmaları
        "gereksiz" sayıp siliyor (any'ye her cast teknik olarak gereksizdir),
        geriye çıplak `any` kalıyor ve aynı yapılandırmanın no-unsafe-*
        kuralları bu kez hata veriyor. Bir kez `--fix` çalıştırıp bu daraltmaları
        kaybettik; tsc temiz kaldığı için de sessizce geçiyordu.
      */
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',

      // Kullanılmayan değişkenleri tsconfig zaten yakalıyor; ESLint'in kopyası
      // yalnızca gürültü yapıyordu.
      '@typescript-eslint/no-unused-vars': 'off',

      // Nesne çözerken yalnızca hepsi sabitse uyar. `let { a, b } = ...` içinde
      // b değişiyorsa a'yı ayrı satıra çıkarmak okunurluğu bozuyor.
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },

  // Testler: node ortamı, promise kuralları gevşek
  {
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },

  // Service worker ve public/ içindeki düz JS: TypeScript projesine dahil değil
  {
    files: ['public/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.serviceworker, ...globals.browser },
    },
  },

  // Yapılandırma dosyaları (bu dosya, vite.config.ts): tip denetimli kurallar
  // dışında; tsconfig'in "include" listesinde değiller.
  {
    files: ['*.config.{js,ts}', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
)
