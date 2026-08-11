// Türkçe metin -> İngilizce karşılığı.
//
// Anahtar, kaynaktaki Türkçe metnin kendisi (bkz. dil.tsx). Buraya
// eklenmemiş bir metin ekranda Türkçe kalır — uygulama kırılmaz, yalnızca o
// kalem çevrilmemiş olur. Türkçe metni değiştirirsen buradaki anahtarı da
// değiştir, yoksa çeviri sessizce düşer.
//
// {ad} gibi süslü parantezli yerler olduğu gibi korunmalı.

export const SOZLUK: Record<string, string> = {
  // ---------------------------------------------------------------- ortak
  Kaydet: 'Save',
  'Kaydediliyor…': 'Saving…',
  Kaydedilemedi: 'Could not save',
  İptal: 'Cancel',
  Tamam: 'OK',
  Kapat: 'Close',
  Vazgeç: 'Never mind',
  Gönder: 'Send',
  'Bekle…': 'Please wait…',
  'Yükleniyor…': 'Loading…',
  'İşlem yapılamadı': 'Something went wrong',
  'Geri dön': 'Go back',
  Geri: 'Back',
  Çıkar: 'Remove',
  'isteğe bağlı': 'optional',
  'şu an sitede': 'online now',
  çevrimdışı: 'offline',
  Diğer: 'More',
  'Önce giriş yapmalısın': 'You need to sign in first',

  // ------------------------------------------------------------ hata metni
  // hataMetni() (supabase/client.ts) buradan geçiyor. Eskiden bu satırların
  // hiçbiri sözlükte yoktu: İngilizce kullanan biri sunucu hatalarını Türkçe
  // görüyordu, tetikleyici hatalarını ise ham ASCII olarak.
  'Bu işlem için yetkin yok.': 'You are not allowed to do that.',
  'Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.':
    'Could not reach the server. Check your connection and try again.',
  'E-posta veya şifre hatalı.': 'Wrong email or password.',
  'Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.':
    'That email is already registered. Try signing in.',
  'Şifre en az 6 karakter olmalı.': 'Password must be at least 6 characters.',
  'Geçerli bir e-posta adresi girin.': 'Enter a valid email address.',
  'E-postanızı doğrulamanız gerekiyor. Gelen kutunuzu kontrol edin.':
    'You need to confirm your email. Check your inbox.',
  'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.':
    'Too many attempts. Wait a moment and try again.',
  'Böyle bir oda bulunamadı. Linki kontrol et.': 'No such room. Check the link.',
  // 'Bu puzzle henüz açılmadı…' ve 'Bu odadan çıkarıldın.' aşağıda, oda
  // bölümünde zaten var — burada tekrarlanmıyor (aynı anahtar iki kez
  // yazılırsa sonuncusu sessizce kazanır).
  'Puzzle’ın sahibi değiştirilemez.': 'A puzzle’s owner cannot be changed.',
  'Bunu yalnızca puzzle’ı kuran kişi değiştirebilir.':
    'Only the person who created the puzzle can change this.',
  'Bu odanın katılımcısı değilsin.': 'You are not a member of this room.',
  'Bu kişi artık odada değil.': 'That person is no longer in the room.',
  'Kendini odadan çıkaramazsın.': 'You cannot remove yourself from the room.',
  'Odayı kuran kişi çıkarılamaz.': 'The person who created the room cannot be removed.',
  'Yetkili birini yalnızca odayı kuran çıkarabilir.':
    'Only the room creator can remove a moderator.',
  'Yetkiyi yalnızca odayı kuran verebilir.': 'Only the room creator can grant this.',
  'Odayı kuranın yetkisi değiştirilemez.':
    'The room creator’s permissions cannot be changed.',
  'Bu arkadaşlık kaydı değiştirilemez.': 'This friendship record cannot be changed.',
  'Bu arkadaşlık isteği böyle güncellenemez.':
    'This friend request cannot be updated that way.',
  'Gönderilmiş bir mesajın içeriği değiştirilemez.':
    'The contents of a sent message cannot be changed.',
  'Bugünlük puzzle oluşturma sınırına ulaştın. Yarın tekrar dene.':
    'You have reached today’s limit for creating puzzles. Try again tomorrow.',
  'Çok hızlı mesaj gönderiyorsun. Biraz bekleyip tekrar dene.':
    'You are sending messages too quickly. Wait a moment and try again.',
  'Bugünlük arkadaşlık isteği sınırına ulaştın. Yarın tekrar dene.':
    'You have reached today’s limit for friend requests. Try again tomorrow.',
  'Bugünlük şikayet sınırına ulaştın.': 'You have reached today’s report limit.',
  'Önce giriş yapmalısın.': 'You need to sign in first.',

  // --------------------------------------------------------- davet ekranı
  Puzzle: 'Puzzle',
  daveti: 'invite',
  'Biri seni birlikte puzzle çözmeye çağırdı. Nasıl devam etmek istersin?':
    'Someone invited you to solve a puzzle together. How would you like to continue?',
  oda: 'room',
  'Hesabımla gireyim': 'Sign in with my account',
  'Çözdüğünüz tablo geçmişine kaydedilir, sonra kaldığın yerden devam edebilirsin. Arkadaş ekleyebilirsin.':
    'The puzzle you solve is saved to your history so you can pick up where you left off. You can also add friends.',
  'Misafir olarak devam et': 'Continue as a guest',
  'Hemen oyuna girersin. Tablo kaydedilmez, geçmişinde görünmez.':
    'You go straight into the game. The puzzle is not saved and will not appear in your history.',
  'Sana ne diyelim?': 'What should we call you?',
  Adın: 'Your name',
  'Misafir olarak gir': 'Enter as a guest',
  'Bu cihazda {ad} olarak girişlisin.': 'You are signed in as {ad} on this device.',
  '"Hesabımla gireyim" seçersen istersen o hesapla devam eder, istersen başka bir hesapla girersin.':
    'If you choose “Sign in with my account” you can continue with that account or use a different one.',

  // ------------------------------------------------------------ ad değiştir
  'Adı değiştir': 'Rename',
  'Puzzle adı': 'Puzzle name',

  // ------------------------------------------------------------ giriş ekranı
  'Tabloların kaybolmasın, beraber çözdüklerin ikinizde de dursun.':
    'Keep your puzzles safe, and let the ones you solve together live on both sides.',
  '{ad} olarak devam et': 'Continue as {ad}',
  Giriş: 'Sign in',
  Kayıt: 'Sign up',
  'E-posta': 'Email',
  Şifre: 'Password',
  'Giriş yap': 'Sign in',
  'Hesap aç': 'Create account',
  'Bir saniye…': 'One moment…',
  'Şifremi unuttum': 'Forgot my password',
  'Girişe dön': 'Back to sign in',
  'Sıfırlama bağlantısı gönder': 'Send reset link',
  'E-postanı yaz, sana yeni şifre belirleyebileceğin bir bağlantı gönderelim.':
    'Enter your email and we will send you a link to set a new password.',
  'Sıfırlama bağlantısı e-postana gönderildi. Gelen kutunu (ve gereksiz klasörünü) kontrol et.':
    'A reset link has been sent to your email. Check your inbox (and your spam folder).',
  'Hesap açıldı. Şimdi giriş yapabilirsin.': 'Account created. You can sign in now.',
  'Beni hatırla': 'Remember me',
  'e-postan hazır gelsin': 'your email will be filled in',

  // ------------------------------------------------------------ hatıra kartı
  İsimsiz: 'Untitled',
  Paylaş: 'Share',
  İndir: 'Download',

  // ------------------------------------------------------------ yeni şifre
  Yeni: 'New',
  şifre: 'password',
  'Hesabın için yeni bir şifre belirle.': 'Set a new password for your account.',
  'Yeni şifre (en az 6 karakter)': 'New password (at least 6 characters)',
  'Yeni şifre (tekrar)': 'New password (again)',
  'Şifreler aynı değil.': 'The passwords do not match.',
  'Şifreyi değiştir': 'Change password',

  // ------------------------------------------------------------ hata ekranı
  'Bir şeyler ters gitti': 'Something went wrong',
  'Beklenmedik bir hata oldu ve oyun durdu. Çözdüğün tablolar sunucuda duruyor, kaybolmadı.':
    'An unexpected error stopped the game. The puzzles you solved are still on the server; nothing was lost.',
  'Sayfayı yenile': 'Reload the page',
  'Cihazdaki kayıtları temizle': 'Clear saved data on this device',
  'Yenilemek işe yaramazsa ikinci düğme bu cihazdaki yarım kalmış oyunları siler. Hesabındaki tablolar etkilenmez.':
    'If reloading does not help, the second button deletes unfinished games on this device. Puzzles in your account are not affected.',

  // ------------------------------------------------------------ görüşme
  'görüntü takıldı…': 'video froze…',
  Dokun: 'Tap',
  sesli: 'audio',
  sen: 'you',
  'Mikrofonun açık. Karşı taraf katılınca sesini duyacaksın.':
    'Your microphone is on. You will hear the other side once they join.',
  'Karşı taraf kamerasını açınca burada görünecek.':
    'The other side will appear here once they turn on their camera.',
  'Kamerayı kapat': 'Turn camera off',
  'Kamerayı aç': 'Turn camera on',
  'Mikrofonu kapat': 'Mute microphone',
  'Mikrofonu aç': 'Unmute microphone',
  'Görüşmeyi bitir': 'End call',

  // ---------------------------------------------------------- ses ayarları
  Ses: 'Sound',
  'Ses ayarları': 'Sound settings',
  'Ses efektleri': 'Sound effects',
  Müzik: 'Music',
  'Ses kapalı. Efektleri duymak için 🔊 düğmesini aç.':
    'Sound is off. Turn on 🔊 to hear the effects.',
  'Müzik açık ama sesi tamamen kısık.': 'Music is on but turned all the way down.',
  'Müzik parçasını seç, sesini ayarla': 'Pick the music, set the volume',
  'Müzik parçası': 'Music track',
  'Sakin piyano': 'Calm piano',
  Gece: 'Night',
  'Müzik kutusu': 'Music box',
  Yağmur: 'Rain',
  'Beyaz gürültü': 'White noise',
  'Müzik: {parca}': 'Music: {parca}',
  '{ad} müziği değiştirdi: {parca}': '{ad} changed the music: {parca}',

  // ------------------------------------------------- taşınabilir yüzen paneller
  'Yerine döndür': 'Move back',
  Orijinal: 'Original',
  'Pencereleri istediğin yere koy': 'Put the windows where you like',
  'Kameralar, sohbet ve orijinal görsel taşınabilir: başlık çubuğundan tutup istediğin yere sürükle. Bıraktığın yer akılda kalır, ↺ ile eski yerine döner. Orijinal görselde iki parmakla yakınlaştırabilir, çift dokunuşla eski hâline döndürebilirsin.':
    'The cameras, the chat and the original picture can be moved: grab one by its title bar and drag it anywhere. Where you leave it is remembered, and ↺ sends it back. Pinch with two fingers to zoom into the original picture, double-tap to reset it.',
  'Kameralar, sohbet ve orijinal görsel taşınabilir: başlık çubuğundan tutup istediğin yere sürükle. Bıraktığın yer akılda kalır, ↺ ile eski yerine döner. Orijinal görselde fare tekerleğiyle yakınlaştırabilir, çift tıklayarak eski hâline döndürebilirsin.':
    'The cameras, the chat and the original picture can be moved: grab one by its title bar and drag it anywhere. Where you leave it is remembered, and ↺ sends it back. Use the mouse wheel to zoom into the original picture, double-click to reset it.',
  'İki parmakla ya da tekerlekle yakınlaştır': 'Pinch or scroll to zoom',
  Görüşme: 'Call',

  // ------------------------------------------------------------ tanıtım turu
  'Parçayı sürükle': 'Drag a piece',
  'Bir parçaya parmağını koyup sürükle. Doğru yerine yaklaştığında kendiliğinden oturur.':
    'Put your finger on a piece and drag it. It snaps into place when it gets close enough.',
  'Bir parçayı tutup sürükle. Doğru yerine yaklaştığında kendiliğinden oturur.':
    'Grab a piece and drag it. It snaps into place when it gets close enough.',
  'Birleşenler birlikte gider': 'Joined pieces move together',
  'Komşu parçalar yan yana gelince birleşir ve artık tek parça gibi hareket eder.':
    'Neighbouring pieces join when they meet and then move as one.',
  'Yanlış birleştirdiysen ayır': 'Split them if you joined the wrong ones',
  'Parçaya basılı tut (yaklaşık yarım saniye), gruptan koparır.':
    'Press and hold a piece (about half a second) to break it out of its group.',
  'Parçaya sağ tıkla, bulunduğu gruptan koparır.':
    'Right-click a piece to break it out of its group.',
  'Parçalar çevrilmiş geldi': 'The pieces arrive rotated',
  'Bu puzzle döndürmeli. Parçaya iki kez dokunarak çeyrek tur çevir; doğru açıyı bulmadan yerine oturmaz.':
    'This puzzle uses rotation. Double-tap a piece to turn it a quarter turn; it will not snap until the angle is right.',
  'Bu puzzle döndürmeli. Parçaya çift tıklayarak çeyrek tur çevir; doğru açıyı bulmadan yerine oturmaz.':
    'This puzzle uses rotation. Double-click a piece to turn it a quarter turn; it will not snap until the angle is right.',
  'Yakınlaş, kaydır': 'Zoom and pan',
  'İki parmakla yakınlaştır, boş bir yerden sürükleyerek tahtayı kaydır.':
    'Pinch to zoom, and drag from an empty spot to move the board.',
  'Fare tekerleğiyle yakınlaştır, boş bir yerden sürükleyerek tahtayı kaydır.':
    'Zoom with the mouse wheel, and drag from an empty spot to move the board.',
  'Üstteki araçlar': 'The tools up top',
  'Takıldığında işini kolaylaştıracak düğmeler:': 'Buttons that help when you get stuck:',
  'Araçlar üst çubuğa sığmadı — hepsi bunun altında':
    'The tools did not fit in the top bar — they are all under this one',
  'Yerleşmemiş parçaları yanlara diz': 'Line up loose pieces along the sides',
  'Parçaları yeniden karıştır': 'Shuffle the pieces again',
  'Sadece kenar parçalarını öne çıkar': 'Highlight edge pieces only',
  'Bütün sesi aç / kapat': 'Turn all sound on / off',
  'Izgarayı göster / gizle': 'Show / hide the grid',
  'Orijinal görsele bak': 'Look at the original picture',
  'Hepsini ekrana sığdır': 'Fit everything on screen',
  // tur başlığı "Müzik" — anahtarı yukarıda, ses paneli satırıyla ortak
  'Beş parça var: sakin piyano, gece, müzik kutusu, yağmur ve beyaz gürültü. 🎚 penceresinden seç; seçtiğin parça odadaki herkeste çalmaya başlar. Sesi kısmak ya da tamamen kapatmak yalnızca seni ilgilendirir — kimse sana ses açtıramaz.':
    'There are five tracks: calm piano, night, music box, rain and white noise. Pick one from the 🎚 window and everyone in the room starts hearing it. Turning it down or off is yours alone — nobody can make sound play on your device.',
  'Beş parça var: sakin piyano, gece, müzik kutusu, yağmur ve beyaz gürültü. 🎚 penceresinden seç, aynı yerden sesini ayarla. Müzik kapalıyken bir parça seçmek onu açar. Birlikte oynarken seçtiğin parça odadaki herkeste çalar.':
    'There are five tracks: calm piano, night, music box, rain and white noise. Pick one from the 🎚 window and set the volume in the same place. Picking a track while the music is off turns it on. When you play together, the track you pick plays for everyone in the room.',
  'Birlikte oynamak istersen': 'If you want to play together',
  'Üstteki Davet düğmesi bir bağlantı üretir. Bağlantıyı gönderdiğin kişi dokununca aynı tahtanın başına gelir; parçalar iki tarafta da aynı anda yerine oturur.':
    'The Invite button up top makes a link. Whoever you send it to lands on this very board when they tap it, and pieces snap into place on both sides at once.',
  'Üstteki Davet düğmesi bir bağlantı üretir. Bağlantıyı gönderdiğin kişi tıklayınca aynı tahtanın başına gelir; parçalar iki tarafta da aynı anda yerine oturur.':
    'The Invite button up top makes a link. Whoever you send it to lands on this very board when they click it, and pieces snap into place on both sides at once.',
  'Birlikte oynarken': 'When playing together',
  'Karşı tarafın imleci tahtada görünür; tuttuğu parça renkli çerçeveyle işaretlenir.':
    "You can see the other player's cursor on the board, and the piece they are holding gets a coloured outline.",
  'Odadakiler ve yetkiler': 'Who is in the room, and permissions',
  'Arkadaşına mesaj at, odaya davet et': 'Message a friend, invite them to the room',
  'Oda içi sohbet': 'Chat inside the room',
  'Görüntülü konuş': 'Video call',
  'Yalnızca sesli konuş': 'Audio-only call',
  'Hepsini atla': 'Skip all',
  İleri: 'Next',
  Başla: 'Start',

  // ------------------------------------------------------------ oda paneli
  Odadakiler: 'In the room',
  '{ad} bu odadan çıkarılacak. Puzzle onun geçmişinden kalkar ve aynı davet linkiyle geri giremez.':
    '{ad} will be removed from this room. The puzzle disappears from their history and the same invite link will not let them back in.',
  'Bu kişinin çıkarma yetkisi de gider.': 'They will also lose the right to remove others.',
  'Odadan çıkar': 'Remove from room',
  kurucu: 'owner',
  yetkili: 'moderator',
  misafir: 'guest',
  odada: 'in the room',
  'şu an bağlı değil': 'not connected right now',
  'hesapsız girdi': 'joined without an account',
  'Çıkarma yetkisini geri al': 'Take back the right to remove',
  'Bu kişi de başkalarını çıkarabilsin': 'Let them remove others too',
  'Yetkiyi al': 'Take permission',
  'Yetki ver': 'Give permission',
  '{ad} bu odadan çıkarılacak ve bağlantısı kesilecek. Aynı davet linkiyle geri giremez; ama oda kapanıp yeniden kurulursa tekrar girebilir.':
    '{ad} will be removed from this room and disconnected. The same invite link will not let them back in, but they can rejoin if the room is closed and set up again.',
  'Şimdilik yalnızsın.': 'You are on your own for now.',
  'Yetki verdiğin kişi sıradan katılımcıları çıkarabilir; sana ve diğer yetkililere dokunamaz.':
    'Someone you give permission to can remove ordinary players, but not you or other moderators.',

  // ------------------------------------------------------- arkadaşlar / mesajlar
  Arkadaşlar: 'Friends',
  Mesajlar: 'Messages',
  'Birlikte puzzle çözelim mi?': 'Shall we solve a puzzle together?',
  'Davet gönderilemedi': 'Could not send the invite',
  'Henüz arkadaşın yok. Ana ekrandaki Arkadaşlar bölümünden ekleyebilirsin.':
    'You have no friends yet. You can add them from the Friends section on the home screen.',
  'Mesaj yaz': 'Write a message',
  'Davet linkini mesaj olarak gönder': 'Send the invite link as a message',
  'Önce odayı kur': 'Set up the room first',
  Gönderildi: 'Sent',
  'Davet et': 'Invite',
  'Davet gönderebilmek için önce üstteki “Davet” düğmesiyle odayı kur.':
    'To send an invite, first set up the room with the “Invite” button above.',
  'Henüz kimseyle yazışmadın.': 'You have not messaged anyone yet.',
  Sen: 'You',
  'Yeni mesaj': 'New message',
  'henüz yazışmadınız': 'you have not messaged yet',
  'seni arkadaş olarak ekledi': 'added you as a friend',
  'Kabul et': 'Accept',
  Yoksay: 'Ignore',
  'Arkadaşlıktan çıkar': 'Remove friend',
  '{ad} arkadaş listenden çıkarılacak. Birbirinize mesaj gönderemezsiniz; birlikte çözdüğünüz tablolar durmaya devam eder.':
    '{ad} will be removed from your friend list. You will not be able to message each other; the puzzles you solved together stay.',
  'istek gönderildi': 'request sent',
  'Geri al': 'Undo',
  Engellediklerin: 'People you blocked',
  'sana mesaj gönderemez': 'cannot message you',
  'Engeli kaldır': 'Unblock',
  'Sana mesaj gönderemezler ve profilini göremezler.':
    'They cannot message you or see your profile.',
  'Engeli kaldırmak arkadaşlığı geri getirmez; yeniden arkadaş olmak için birinizin istek göndermesi gerekir.':
    'Unblocking does not restore the friendship; one of you has to send a request again.',
  'Arkadaş ara': 'Find a friend',
  'Adının en az {n} harfi': 'At least {n} letters of their name',
  'Bu adla kimse bulunamadı.': 'Nobody found with that name.',
  'Birlikte puzzle çözdüklerin': 'People you solved puzzles with',
  Ekle: 'Add',

  // ------------------------------------------------------------ mesaj kutusu
  'Mesaj gönderilemedi': 'Could not send the message',
  'Şikayet et': 'Report',
  Engelle: 'Block',
  'Ne oldu?': 'What happened?',
  'Kısaca anlat…': 'Tell us briefly…',
  'Şikayetin iletildi. Teşekkürler.': 'Your report has been sent. Thank you.',
  Gönderilemedi: 'Could not send',
  Teşekkürler: 'Thank you',
  '{ad} sana mesaj gönderemeyecek ve profilini göremeyecek. Aranızdaki arkadaşlık da kalkar. İstediğin zaman engeli kaldırabilirsin.':
    '{ad} will not be able to message you or see your profile, and your friendship ends. You can unblock them at any time.',
  'Henüz mesajlaşmamışsınız.': 'You have not messaged each other yet.',
  'Bu mesajı sil': 'Delete this message',
  Silinemedi: 'Could not delete',
  '{emoji} ekle': 'add {emoji}',
  'Daha az göster': 'Show fewer',
  'Daha fazla emoji': 'More emoji',
  'Mesaj yaz…': 'Write a message…',

  // ------------------------------------------------------------ hazırlık ekranı
  Hazırlık: 'Setup',
  'Seçtiğin görsel': 'The picture you chose',
  Adı: 'Name',
  'Kaç parça': 'How many pieces',
  '{sayi} parça': '{sayi} pieces',
  'Kaç kişi': 'How many players',
  ikiniz: 'the two of you',
  'sen + {sayi} kişi': 'you + {sayi} others',
  Zorluk: 'Difficulty',
  'Parçalar çevrilmiş gelsin': 'Start the pieces rotated',
  'çift tıkla döndürürsün': 'double-click to turn them',
  'Gizli not': 'Secret note',
  'Bitince görsün diye bir şeyler yaz…': 'Write something for them to see at the end…',
  'Özel gün için sakla': 'Save it for a special day',
  'o tarihe kadar kilitli kalır': 'stays locked until that date',
  'Açılacağı tarih ve saat': 'Date and time it opens',
  'Açılacağı tarihi ve saati seç.': 'Choose the date and time it opens.',
  'Bu tarih okunamadı, yeniden seç.': 'That date could not be read, pick it again.',
  'Tarih ileride bir zaman olmalı.': 'The date has to be in the future.',
  'Tek başıma': 'On my own',
  'Birlikte oyna': 'Play together',
  Sakla: 'Save it',

  // ------------------------------------------------------------ profil
  Profilim: 'My profile',
  'Bu görsel açılamadı, başka bir tane dene.':
    'That picture could not be opened, try another one.',
  'Doğum yılı 1900 ile {yil} arasında olmalı.':
    'The birth year has to be between 1900 and {yil}.',
  'Fotoğraf seç': 'Choose a photo',
  Değiştir: 'Change',
  Kaldır: 'Remove',
  'Kare kırpılır, 256 piksele küçültülür.':
    'It is cropped to a square and scaled down to 256 pixels.',
  // "Adın" davet ekranı bölümünde zaten var
  'Görünecek adın': 'The name others see',
  'Doğum yılı': 'Year of birth',
  '{yas} yaşındasın': 'you are {yas}',
  'örn. 1998': 'e.g. 1998',
  Cinsiyet: 'Gender',
  Seçilmedi: 'Not selected',
  Kadın: 'Woman',
  Erkek: 'Man',
  'Bu bilgileri yalnızca birlikte puzzle çözdüğün ve arkadaş olduğun kişiler görebilir.':
    'Only people you solve puzzles with and people you are friends with can see this.',
  'Hesabı sil': 'Delete account',
  'Tablolarını, fotoğraflarını, mesajlarını ve hesabını kalıcı olarak siler. Geri alınamaz.':
    'Permanently deletes your puzzles, photos, messages and account. This cannot be undone.',
  'Hesabımı sil': 'Delete my account',
  'Hesabını sil': 'Delete your account',
  'Hesabın, çözdüğün tablolar, yüklediğin fotoğraflar, arkadaşlıkların ve mesajların kalıcı olarak silinecek. Bu işlem geri alınamaz.':
    'Your account, the puzzles you solved, the photos you uploaded, your friendships and your messages will be permanently deleted. This cannot be undone.',

  // ------------------------------------------------------------ ana ekran
  '{saat} sa {dk} dk': '{saat} h {dk} min',
  '{dk} dk': '{dk} min',
  '{sn} sn': '{sn} s',
  açıldı: 'unlocked',
  '{gun} gün {saat} saat kaldı': '{gun} d {saat} h left',
  '{saat} saat {dk} dk kaldı': '{saat} h {dk} min left',
  '{dk} dk kaldı': '{dk} min left',
  bugün: 'today',
  dün: 'yesterday',
  '{gun} gün önce': '{gun} days ago',
  'Yeniden eskiye': 'Newest first',
  'Eskiden yeniye': 'Oldest first',
  'En çok parçadan aza': 'Most pieces first',
  'En az parçadan çoğa': 'Fewest pieces first',
  Sıralama: 'Sort',
  'Henüz açılmadı': 'Not open yet',
  'Bu puzzle özel gün için saklanmış. {ne} tarihinde açılacak.':
    'This puzzle is being saved for a special day. It opens on {ne}.',
  'Görsel açılamadı': 'Could not open the picture',
  'Bu dosya okunamadı. Başka bir fotoğraf deneyebilirsin.':
    'This file could not be read. Try another photo.',
  'Bu dosya olmaz': 'Not that kind of file',
  'Yalnızca resim dosyası bırakabilirsin (jpg, png, webp).':
    'You can only drop image files (jpg, png, webp).',
  "Puzzle'ı sil": 'Delete puzzle',
  Sil: 'Delete',
  '"{ad}" bu cihazdan silinecek. İlerlemen kaybolur, geri alınamaz.':
    '“{ad}” will be deleted from this device. Your progress is lost and cannot be recovered.',
  '{kisiler} ile birlikte çözdüğünüz bu tablo herkesin geçmişinden kalkar.':
    'This puzzle, which you solved together with {kisiler}, disappears from everyone’s history.',
  '"{ad}" kalıcı olarak silinecek; fotoğrafı da sunucudan kaldırılır.':
    '“{ad}” will be permanently deleted, and its photo is removed from the server too.',
  'Geri alınamaz.': 'This cannot be undone.',
  'Bırak gitsin': 'Drop it here',
  "Fotoğrafı buraya bırak, puzzle'a çevireyim":
    'Drop the photo here and I will turn it into a puzzle',
  'Profilini düzenle': 'Edit your profile',
  Profil: 'Profile',
  Çıkış: 'Sign out',
  Misafirsin: 'You are a guest',
  "Fotoğrafını seç, linki gönder, aynı puzzle'ı beraber çözün.":
    'Pick a photo, send the link, and solve the same puzzle together.',
  'Hazırlanıyor…': 'Getting ready…',
  'Fotoğraf yükle': 'Upload a photo',
  'ya da fotoğrafı sürükleyip buraya bırak': 'or drag a photo and drop it here',
  'biten puzzle': 'puzzles finished',
  'toplam süre': 'total time',
  'çözülen parça': 'pieces solved',
  'en hızlı': 'fastest',
  Tablolarım: 'My puzzles',
  'Yeniden adlandır': 'Rename',
  bitti: 'finished',
  'Bu cihazda': 'On this device',
  'giriş yaparsan kaybolmaz': 'sign in and they will not be lost',
  'Hazır olanlar': 'Ready to play',
  '{sayi} eser': '{sayi} artworks',
  Hepsi: 'All',
  'Tümünü göster ({sayi} tane daha)': 'Show all ({sayi} more)',
  'Türk resmi': 'Turkish painting',
  Portreler: 'Portraits',
  'Ünlü sahneler': 'Famous scenes',
  'Manzara & deniz': 'Landscape & sea',
  'Çiçek & doğa': 'Flowers & nature',
  Hayvanlar: 'Animals',
  Desenler: 'Patterns',

  // ------------------------------------------------------------ App
  'Özel gün için saklanıyor…': 'Saving it for the special day…',
  'Özel gün için saklandı': 'Saved for the special day',
  '"{ad}" {ne} tarihinde açılacak. O güne kadar kimse göremez.':
    '“{ad}” opens on {ne}. Until then nobody can see it.',
  'Bağlantını kontrol edip tekrar dene.': 'Check your connection and try again.',
  Davete: 'Join',
  katıl: 'the invite',
  'Hesabınla gir; çözdüğünüz tablo ikinizin de geçmişine düşsün.':
    'Sign in so the puzzle you solve lands in both of your histories.',
  'Vazgeçtim, misafir olarak gireyim': 'Never mind, let me join as a guest',
  'Odaya bağlanılıyor': 'Connecting to the room',

  // ------------------------------------------------------------ oyun ekranı
  Bağlanıyor: 'Connecting',
  Bekleniyor: 'Waiting',
  Bağlı: 'Connected',
  Koptu: 'Disconnected',
  Bağlanamadı: 'Could not connect',
  'Parçalar kesiliyor': 'Cutting the pieces',
  'Fotoğraf geliyor': 'Photo on its way',
  'Fotoğraf getiriliyor': 'Fetching the photo',
  'Fotoğrafa erişilemedi': 'Could not reach the photo',
  'Fotoğrafa ulaşamadık. Bağlantını kontrol et.':
    'We could not reach the photo. Check your connection.',
  'Bu odadan çıkarıldın.': 'You were removed from this room.',
  'Bu puzzle henüz açılmadı. Özel gün için saklanmış.':
    'This puzzle is not open yet. It is being saved for a special day.',
  'Oda kapalı. Karşı tarafın sayfası hâlâ açık mı?':
    'The room is closed. Is the other side’s page still open?',
  'Bağlanamadık. Karşı taraf sayfayı öne alıp tekrar denesin.':
    'We could not connect. Ask the other side to bring the page to the front and try again.',
  'Bağlanamadık. Ağınız doğrudan bağlantıya izin vermiyor ve yedek aktarma sunucusuna da ulaşılamadı. Farklı bir ağ (ör. mobil veri) deneyebilirsiniz.':
    'We could not connect. Your network does not allow a direct connection and the fallback relay server could not be reached either. Try a different network (mobile data, for example).',
  'Bağlandık ama puzzle gelmedi. Karşı taraf sayfayı öne alsın.':
    'We connected but the puzzle did not arrive. Ask the other side to bring the page to the front.',
  Çık: 'Leave',
  Davet: 'Invite',
  Bağlan: 'Connect',
  'Arkadaşlar — mesaj gönder, odaya davet et': 'Friends — send a message, invite to the room',
  Sohbet: 'Chat',
  'Parçaları yanlara diz': 'Line the pieces up on the sides',
  Karıştır: 'Shuffle',
  'Sadece kenarlar': 'Edges only',
  'Ses efektlerini kapat': 'Turn sound effects off',
  'Ses efektlerini aç': 'Turn sound effects on',
  'Müziği kapat': 'Turn the music off',
  'Müziği aç': 'Turn the music on',
  'Diğer araçlar': 'More tools',
  'Orijinali göster': 'Show the original',
  'Hepsini göster': 'Show everything',
  'Nasıl oynanır': 'How to play',
  'Kamera açılamıyor': 'Cannot open the camera',
  'Bu tarayıcı kamera ve mikrofon erişimini desteklemiyor.':
    'This browser does not support camera and microphone access.',
  'Kamera yalnızca güvenli bağlantıda (https) açılabilir.':
    'The camera can only be opened over a secure connection (https).',
  'Mikrofon açılamadı': 'Could not open the microphone',
  'Kamera açılamadı': 'Could not open the camera',
  'İzin verilmedi. Tarayıcı adres çubuğundaki kilit simgesinden kamera ve mikrofon iznini açabilirsin.':
    'Permission was denied. You can grant camera and microphone access from the lock icon in the address bar.',
  'Mikrofon bulunamadı.': 'No microphone found.',
  'Kamera bulunamadı. Yalnızca sesli konuşmayı deneyebilirsin.':
    'No camera found. You can try an audio-only call.',
  'Kamera başka bir uygulamada açık görünüyor. Onu kapatıp tekrar dene.':
    'The camera looks like it is in use by another app. Close it and try again.',
  'Açılamadı{ek}. Sayfayı yenileyip tekrar dene.':
    'Could not open it{ek}. Reload the page and try again.',
  'Cihaz adresi': 'Device address',
  'Dışarıdan görünen adres': 'Address seen from outside',
  'Aktarma sunucusu (TURN)': 'Relay server (TURN)',
  'Deneniyor…': 'Testing…',
  'Bağlantıyı test et': 'Test the connection',
  'Tekrar dene': 'Try again',
  'Linki gönder': 'Send the link',
  Kopyala: 'Copy',
  Kopyalandı: 'Copied',
  'Sen bu sayfadayken bağlanabilirler.': 'They can connect while you are on this page.',
  'Henüz mesaj yok.': 'No messages yet.',
  'Karşı taraf bağlanınca yazabilirsin.': 'You can write once the other side connects.',
  'Bir şeyler yaz…': 'Write something…',
  'Bağlantı bekleniyor…': 'Waiting for the connection…',
  Bitti: 'Done',
  'Hatıra kartı': 'Keepsake card',
  '%{yuzde} tamam': '{yuzde}% done',
  Izgara: 'Grid',

  // ------------------------------------------------------------ eser adları
  //
  // Ressam adları özel isim, çevrilmiyor. Eser adları çeviriliyor çünkü
  // bu tabloların yerleşik İngilizce adları var; "Çığlık" yazan bir galeri
  // İngilizce okuyana bir şey anlatmıyor.
  'Kaplumbağa Terbiyecisi': 'The Tortoise Trainer',
  'İki Müzisyen Kız': 'Two Musician Girls',
  'Mona Lisa': 'Mona Lisa',
  'İnci Küpeli Kız': 'Girl with a Pearl Earring',
  'Adele Bloch-Bauer': 'Adele Bloch-Bauer',
  'Arnolfini Portresi': 'The Arnolfini Portrait',
  'Amerikan Gotiği': 'American Gothic',
  'Süt Dağıtan Kadın': 'The Milkmaid',
  Öpücük: 'The Kiss',
  Çığlık: 'The Scream',
  'Gece Devriyesi': 'The Night Watch',
  'Son Akşam Yemeği': 'The Last Supper',
  'Moulin de la Galette': 'Bal du moulin de la Galette',
  'Teknede Öğle Yemeği': 'Luncheon of the Boating Party',
  'Bale Dersi': 'The Ballet Class',
  'Grande Jatte': 'A Sunday on La Grande Jatte',
  'Gece Kafe Terası': 'Café Terrace at Night',
  'Büyük Dalga': 'The Great Wave off Kanagawa',
  'Dokuzuncu Dalga': 'The Ninth Wave',
  'Kızıl Fuji': 'Red Fuji',
  'Sis Denizi Üzerinde Gezgin': 'Wanderer above the Sea of Fog',
  'Savaşçı Téméraire': 'The Fighting Temeraire',
  'İzlenim, Gündoğumu': 'Impression, Sunrise',
  'Karda Avcılar': 'The Hunters in the Snow',
  'Babil Kulesi': 'The Tower of Babel',
  'Yıldızlı Gece': 'The Starry Night',
  Ayçiçekleri: 'Sunflowers',
  'Badem Çiçekleri': 'Almond Blossoms',
  Nilüferler: 'Water Lilies',
  Kedi: 'Cat',
  Köpek: 'Dog',
  'Gün Batımı': 'Sunset',
  Kalpler: 'Hearts',
  Mozaik: 'Mosaic',
  "Âdem'in Yaratılışı": 'The Creation of Adam',
}
