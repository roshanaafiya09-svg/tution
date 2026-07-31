// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Tamil (`ta`).
class AppLocalizationsTa extends AppLocalizations {
  AppLocalizationsTa([String locale = 'ta']) : super(locale);

  @override
  String get appTagline =>
      'உங்கள் வகுப்புகள், பாடக்குறிப்புகள், வீட்டுப்பாடம் — ஒரே இடத்தில்.';

  @override
  String get mobileNumberLabel => 'மொபைல் எண்';

  @override
  String get mobileNumberError => 'சரியான 10-இலக்க மொபைல் எண்ணை உள்ளிடவும்';

  @override
  String get sendOtp => 'OTP அனுப்பவும்';

  @override
  String get otpDeliveryNote =>
      'வாட்ஸ்அப் வழியாக ஒரு முறை பயன்படும் குறியீட்டை அனுப்புவோம்.';

  @override
  String get enterCodeTitle => 'குறியீட்டை உள்ளிடவும்';

  @override
  String codeSentTo(String phone) {
    return '+91 $phone க்கு வாட்ஸ்அப் வழியாக அனுப்பப்பட்டது';
  }

  @override
  String get otpCodeError => '6-இலக்க குறியீட்டை உள்ளிடவும்';

  @override
  String get newHerePrompt => 'புதியவரா? நீங்கள் யார் என்று கூறுங்கள்:';

  @override
  String get roleStudent => 'மாணவர்';

  @override
  String get roleTutor => 'ஆசிரியர்';

  @override
  String get verifyAndContinue => 'சரிபார்த்து தொடரவும்';

  @override
  String get navToday => 'இன்று';

  @override
  String get navMaterials => 'பாடக்குறிப்புகள்';

  @override
  String get navHomework => 'வீட்டுப்பாடம்';

  @override
  String get navProgress => 'முன்னேற்றம்';

  @override
  String get settingsTitle => 'அமைப்புகள்';

  @override
  String get signOut => 'வெளியேறு';

  @override
  String get welcomeStudent => 'வணக்கம், மாணவரே';

  @override
  String get welcomeTutor => 'வணக்கம், ஆசிரியரே';

  @override
  String get todaySectionToday => 'இன்று';

  @override
  String get todaySectionUpcoming => 'வரவிருக்கும்';

  @override
  String get todayEmptyState =>
      'அடுத்த இரண்டு வாரங்களில் வகுப்புகள் எதுவும் திட்டமிடப்படவில்லை.\nபுதுப்பிக்க கீழே இழுக்கவும்.';

  @override
  String get todayLoadError => 'உங்கள் வகுப்புகளை ஏற்ற முடியவில்லை.';

  @override
  String get retry => 'மீண்டும் முயற்சிக்கவும்';

  @override
  String get joinClass => 'இணைக';

  @override
  String get classCancelled => 'ரத்து செய்யப்பட்டது';

  @override
  String get joinNoLinkYet =>
      'வருகை பதிவு செய்யப்பட்டது — உங்கள் ஆசிரியர் இன்னும் இணைப்பைச் சேர்க்கவில்லை.';

  @override
  String get tutorPlaceholderTitle => 'இன்றைய வகுப்புகள் இங்கே தோன்றும்';

  @override
  String get tutorPlaceholderBody =>
      'உங்கள் கற்பித்தல் நிறுவனத்தை வலை டாஷ்போர்டிலிருந்து நடத்துங்கள். இந்த ஆப் வருகை மற்றும் அறிவிப்புகளுக்காக விரைவில் — தற்போது கட்டமைக்கப்பட்டு வருகிறது.';

  @override
  String get materialsTitle => 'பாடக்குறிப்புகள்';

  @override
  String get batchesLoadError => 'உங்கள் பேட்சுகளை ஏற்ற முடியவில்லை.';

  @override
  String get noEnrolledBatches => 'நீங்கள் இன்னும் எந்த பேட்சிலும் சேரவில்லை.';

  @override
  String get materialsLoadError => 'பாடக்குறிப்புகளை ஏற்ற முடியவில்லை.';

  @override
  String get bookmarkedSection => 'புக்மார்க் செய்யப்பட்டவை';

  @override
  String get noMaterialsYet => 'இன்னும் பாடக்குறிப்புகள் இல்லை.';

  @override
  String get removeBookmark => 'புக்மார்க்கை நீக்கு';

  @override
  String get addBookmark => 'புக்மார்க் செய்';

  @override
  String get homeworkTitle => 'வீட்டுப்பாடம்';

  @override
  String get homeworkLoadError => 'வீட்டுப்பாடத்தை ஏற்ற முடியவில்லை.';

  @override
  String get noHomeworkYet => 'இன்னும் வீட்டுப்பாடம் இல்லை.';

  @override
  String get takePhoto => 'புகைப்படம் எடுக்கவும்';

  @override
  String get chooseFromGallery => 'கேலரியிலிருந்து தேர்ந்தெடுக்கவும்';

  @override
  String get choosePdf => 'PDF ஐ தேர்ந்தெடுக்கவும்';

  @override
  String get submitHomework => 'வீட்டுப்பாடத்தை சமர்ப்பிக்கவும்';

  @override
  String get statusPending => 'நிலுவையில்';

  @override
  String get statusSubmitted => 'சமர்ப்பிக்கப்பட்டது';

  @override
  String get statusGraded => 'மதிப்பிடப்பட்டது';

  @override
  String gradeLabel(String grade) {
    return 'மதிப்பெண்: $grade';
  }

  @override
  String assignmentDueLine(String batchTitle, String dueDate) {
    return '$batchTitle · கடைசி தேதி $dueDate';
  }

  @override
  String get progressTitle => 'முன்னேற்றம்';

  @override
  String get progressLoadError => 'உங்கள் முன்னேற்றத்தை ஏற்ற முடியவில்லை.';

  @override
  String get attendanceLabel => 'வருகை';

  @override
  String get homeworkDoneLabel => 'வீட்டுப்பாடம் முடிந்தது';

  @override
  String get invalidInviteLink => 'இந்த அழைப்பு இணைப்பு செல்லுபடியாகாது.';

  @override
  String get youreIn => 'நீங்கள் இணைந்துவிட்டீர்கள்';

  @override
  String joinedBatchMessage(String batchTitle) {
    return 'நீங்கள் $batchTitle இல் சேர்ந்துவிட்டீர்கள். உங்கள் வகுப்புகளும் வீட்டுப்பாடங்களும் ஆப்பில் தோன்றும்.';
  }

  @override
  String get goToToday => 'இன்றுக்கு செல்லவும்';

  @override
  String get invitedToJoin => 'நீங்கள் சேர அழைக்கப்பட்டுள்ளீர்கள்';

  @override
  String get inviteInactive =>
      'இந்த அழைப்பு இணைப்பு இனி செயலில் இல்லை. உங்கள் ஆசிரியரிடம் புதிய இணைப்பைக் கேளுங்கள்.';

  @override
  String get joinThisBatch => 'இந்த பேட்சில் சேரவும்';

  @override
  String get joining => 'சேர்கிறது…';

  @override
  String get accountSectionTitle => 'உங்கள் தரவு';

  @override
  String get accountSectionBody =>
      'ஆப்பில் உள்ள உங்கள் அனைத்து தரவையும் ஏற்றுமதி செய்யவும், அல்லது உங்கள் கணக்கை நிரந்தரமாக நீக்கவும்.';

  @override
  String get exportMyData => 'எனது தரவை ஏற்றுமதி செய்';

  @override
  String get preparingExport => 'ஏற்றுமதி தயாராகிறது…';

  @override
  String get deleteMyAccount => 'எனது கணக்கை நீக்கு';

  @override
  String get deleteAccountWarning =>
      'இது உங்கள் கணக்கை நிரந்தரமாக நீக்கி எல்லா இடங்களிலும் உங்களை வெளியேற்றும். உங்கள் பேட்சுகள், வருகை மற்றும் கட்டண பதிவுகள் அவை சம்பந்தப்பட்ட மற்றவர்களுக்காக வைக்கப்படும், ஆனால் உங்கள் தொடர்பு விவரங்கள் அகற்றப்படும், இந்த எண்ணுடன் நீங்கள் மீண்டும் உள்நுழைய முடியாது.';

  @override
  String get confirmDeleteAccount => 'ஆம், எனது கணக்கை நிரந்தரமாக நீக்கவும்';

  @override
  String get cancel => 'ரத்து செய்';

  @override
  String get deleting => 'நீக்குகிறது…';
}
