import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_ta.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'gen/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('ta'),
  ];

  /// No description provided for @appTagline.
  ///
  /// In en, this message translates to:
  /// **'Your classes, materials and homework — in one place.'**
  String get appTagline;

  /// No description provided for @emailLabel.
  ///
  /// In en, this message translates to:
  /// **'Email address'**
  String get emailLabel;

  /// No description provided for @emailError.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid email address'**
  String get emailError;

  /// No description provided for @sendOtp.
  ///
  /// In en, this message translates to:
  /// **'Send OTP'**
  String get sendOtp;

  /// No description provided for @otpDeliveryNote.
  ///
  /// In en, this message translates to:
  /// **'We\'ll send a one-time code by email.'**
  String get otpDeliveryNote;

  /// No description provided for @enterCodeTitle.
  ///
  /// In en, this message translates to:
  /// **'Enter the code'**
  String get enterCodeTitle;

  /// No description provided for @codeSentTo.
  ///
  /// In en, this message translates to:
  /// **'Code sent to {identifier}'**
  String codeSentTo(String identifier);

  /// No description provided for @otpCodeError.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code'**
  String get otpCodeError;

  /// No description provided for @newHerePrompt.
  ///
  /// In en, this message translates to:
  /// **'New here? Tell us who you are:'**
  String get newHerePrompt;

  /// No description provided for @roleStudent.
  ///
  /// In en, this message translates to:
  /// **'Student'**
  String get roleStudent;

  /// No description provided for @roleTutor.
  ///
  /// In en, this message translates to:
  /// **'Tutor'**
  String get roleTutor;

  /// No description provided for @signupPhoneLabel.
  ///
  /// In en, this message translates to:
  /// **'Phone number'**
  String get signupPhoneLabel;

  /// No description provided for @signupPhoneError.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid 10-digit mobile number'**
  String get signupPhoneError;

  /// No description provided for @verifyAndContinue.
  ///
  /// In en, this message translates to:
  /// **'Verify & continue'**
  String get verifyAndContinue;

  /// No description provided for @navToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get navToday;

  /// No description provided for @navMaterials.
  ///
  /// In en, this message translates to:
  /// **'Materials'**
  String get navMaterials;

  /// No description provided for @navHomework.
  ///
  /// In en, this message translates to:
  /// **'Homework'**
  String get navHomework;

  /// No description provided for @navProgress.
  ///
  /// In en, this message translates to:
  /// **'Progress'**
  String get navProgress;

  /// No description provided for @settingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTitle;

  /// No description provided for @signOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get signOut;

  /// No description provided for @welcomeStudent.
  ///
  /// In en, this message translates to:
  /// **'Welcome, student'**
  String get welcomeStudent;

  /// No description provided for @welcomeTutor.
  ///
  /// In en, this message translates to:
  /// **'Welcome, tutor'**
  String get welcomeTutor;

  /// No description provided for @todaySectionToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get todaySectionToday;

  /// No description provided for @todaySectionUpcoming.
  ///
  /// In en, this message translates to:
  /// **'Upcoming'**
  String get todaySectionUpcoming;

  /// No description provided for @todayEmptyState.
  ///
  /// In en, this message translates to:
  /// **'No classes scheduled in the next two weeks.\nPull down to refresh.'**
  String get todayEmptyState;

  /// No description provided for @todayLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load your classes.'**
  String get todayLoadError;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// No description provided for @joinClass.
  ///
  /// In en, this message translates to:
  /// **'Join'**
  String get joinClass;

  /// No description provided for @classCancelled.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get classCancelled;

  /// No description provided for @joinNoLinkYet.
  ///
  /// In en, this message translates to:
  /// **'Attendance recorded — your tutor hasn\'t added a link yet.'**
  String get joinNoLinkYet;

  /// No description provided for @tutorPlaceholderTitle.
  ///
  /// In en, this message translates to:
  /// **'Today\'s classes will show up here'**
  String get tutorPlaceholderTitle;

  /// No description provided for @tutorPlaceholderBody.
  ///
  /// In en, this message translates to:
  /// **'Run your teaching business from the web dashboard. This app is for on-the-go attendance and announcements — coming soon.'**
  String get tutorPlaceholderBody;

  /// No description provided for @materialsTitle.
  ///
  /// In en, this message translates to:
  /// **'Materials'**
  String get materialsTitle;

  /// No description provided for @batchesLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load your batches.'**
  String get batchesLoadError;

  /// No description provided for @noEnrolledBatches.
  ///
  /// In en, this message translates to:
  /// **'You\'re not enrolled in any batches yet.'**
  String get noEnrolledBatches;

  /// No description provided for @materialsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load materials.'**
  String get materialsLoadError;

  /// No description provided for @bookmarkedSection.
  ///
  /// In en, this message translates to:
  /// **'Bookmarked'**
  String get bookmarkedSection;

  /// No description provided for @noMaterialsYet.
  ///
  /// In en, this message translates to:
  /// **'No materials yet.'**
  String get noMaterialsYet;

  /// No description provided for @removeBookmark.
  ///
  /// In en, this message translates to:
  /// **'Remove bookmark'**
  String get removeBookmark;

  /// No description provided for @addBookmark.
  ///
  /// In en, this message translates to:
  /// **'Bookmark'**
  String get addBookmark;

  /// No description provided for @homeworkTitle.
  ///
  /// In en, this message translates to:
  /// **'Homework'**
  String get homeworkTitle;

  /// No description provided for @homeworkLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load homework.'**
  String get homeworkLoadError;

  /// No description provided for @noHomeworkYet.
  ///
  /// In en, this message translates to:
  /// **'No homework yet.'**
  String get noHomeworkYet;

  /// No description provided for @takePhoto.
  ///
  /// In en, this message translates to:
  /// **'Take a photo'**
  String get takePhoto;

  /// No description provided for @chooseFromGallery.
  ///
  /// In en, this message translates to:
  /// **'Choose from gallery'**
  String get chooseFromGallery;

  /// No description provided for @choosePdf.
  ///
  /// In en, this message translates to:
  /// **'Choose a PDF'**
  String get choosePdf;

  /// No description provided for @submitHomework.
  ///
  /// In en, this message translates to:
  /// **'Submit homework'**
  String get submitHomework;

  /// No description provided for @statusPending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get statusPending;

  /// No description provided for @statusSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Submitted'**
  String get statusSubmitted;

  /// No description provided for @statusGraded.
  ///
  /// In en, this message translates to:
  /// **'Graded'**
  String get statusGraded;

  /// No description provided for @gradeLabel.
  ///
  /// In en, this message translates to:
  /// **'Grade: {grade}'**
  String gradeLabel(String grade);

  /// No description provided for @assignmentDueLine.
  ///
  /// In en, this message translates to:
  /// **'{batchTitle} · Due {dueDate}'**
  String assignmentDueLine(String batchTitle, String dueDate);

  /// No description provided for @progressTitle.
  ///
  /// In en, this message translates to:
  /// **'Progress'**
  String get progressTitle;

  /// No description provided for @progressLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load your progress.'**
  String get progressLoadError;

  /// No description provided for @attendanceLabel.
  ///
  /// In en, this message translates to:
  /// **'Attendance'**
  String get attendanceLabel;

  /// No description provided for @homeworkDoneLabel.
  ///
  /// In en, this message translates to:
  /// **'Homework done'**
  String get homeworkDoneLabel;

  /// No description provided for @invalidInviteLink.
  ///
  /// In en, this message translates to:
  /// **'This invite link is not valid.'**
  String get invalidInviteLink;

  /// No description provided for @youreIn.
  ///
  /// In en, this message translates to:
  /// **'You\'re in'**
  String get youreIn;

  /// No description provided for @joinedBatchMessage.
  ///
  /// In en, this message translates to:
  /// **'You\'ve joined {batchTitle}. Your classes and homework will show up in the app.'**
  String joinedBatchMessage(String batchTitle);

  /// No description provided for @goToToday.
  ///
  /// In en, this message translates to:
  /// **'Go to Today'**
  String get goToToday;

  /// No description provided for @invitedToJoin.
  ///
  /// In en, this message translates to:
  /// **'You\'ve been invited to join'**
  String get invitedToJoin;

  /// No description provided for @inviteInactive.
  ///
  /// In en, this message translates to:
  /// **'This invite link is no longer active. Ask your tutor for a new one.'**
  String get inviteInactive;

  /// No description provided for @joinThisBatch.
  ///
  /// In en, this message translates to:
  /// **'Join this batch'**
  String get joinThisBatch;

  /// No description provided for @joining.
  ///
  /// In en, this message translates to:
  /// **'Joining…'**
  String get joining;

  /// No description provided for @inviteParentSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Link a parent'**
  String get inviteParentSectionTitle;

  /// No description provided for @inviteParentSectionBody.
  ///
  /// In en, this message translates to:
  /// **'Generate a code and share it with your parent — they\'ll use it to see your attendance, progress, and weekly digest.'**
  String get inviteParentSectionBody;

  /// No description provided for @generateParentInviteCode.
  ///
  /// In en, this message translates to:
  /// **'Generate a code'**
  String get generateParentInviteCode;

  /// No description provided for @generatingCode.
  ///
  /// In en, this message translates to:
  /// **'Generating…'**
  String get generatingCode;

  /// No description provided for @parentInviteDialogTitle.
  ///
  /// In en, this message translates to:
  /// **'Share this code with your parent'**
  String get parentInviteDialogTitle;

  /// No description provided for @parentInviteDialogBody.
  ///
  /// In en, this message translates to:
  /// **'Send it to them on WhatsApp — they\'ll paste it into their own \"Link a child\" screen.'**
  String get parentInviteDialogBody;

  /// No description provided for @copyCode.
  ///
  /// In en, this message translates to:
  /// **'Copy'**
  String get copyCode;

  /// No description provided for @codeCopied.
  ///
  /// In en, this message translates to:
  /// **'Code copied'**
  String get codeCopied;

  /// No description provided for @close.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get close;

  /// No description provided for @accountSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Your data'**
  String get accountSectionTitle;

  /// No description provided for @accountSectionBody.
  ///
  /// In en, this message translates to:
  /// **'Export everything the app has on you, or permanently delete your account.'**
  String get accountSectionBody;

  /// No description provided for @exportMyData.
  ///
  /// In en, this message translates to:
  /// **'Export my data'**
  String get exportMyData;

  /// No description provided for @preparingExport.
  ///
  /// In en, this message translates to:
  /// **'Preparing export…'**
  String get preparingExport;

  /// No description provided for @deleteMyAccount.
  ///
  /// In en, this message translates to:
  /// **'Delete my account'**
  String get deleteMyAccount;

  /// No description provided for @deleteAccountWarning.
  ///
  /// In en, this message translates to:
  /// **'This permanently deletes your account and signs you out everywhere. Your batches, attendance and fee records are kept for other people they belong to, but your contact details are removed and you can never sign back in with this number.'**
  String get deleteAccountWarning;

  /// No description provided for @confirmDeleteAccount.
  ///
  /// In en, this message translates to:
  /// **'Yes, permanently delete my account'**
  String get confirmDeleteAccount;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @deleting.
  ///
  /// In en, this message translates to:
  /// **'Deleting…'**
  String get deleting;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'ta'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'ta':
      return AppLocalizationsTa();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
