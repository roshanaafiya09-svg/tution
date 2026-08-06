// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTagline =>
      'Your classes, materials and homework — in one place.';

  @override
  String get mobileNumberLabel => 'Mobile number';

  @override
  String get mobileNumberError => 'Enter a valid 10-digit mobile number';

  @override
  String get sendOtp => 'Send OTP';

  @override
  String get otpDeliveryNote => 'We\'ll send a one-time code over WhatsApp.';

  @override
  String get enterCodeTitle => 'Enter the code';

  @override
  String codeSentTo(String phone) {
    return 'Sent via WhatsApp to +91 $phone';
  }

  @override
  String get otpCodeError => 'Enter the 6-digit code';

  @override
  String get newHerePrompt => 'New here? Tell us who you are:';

  @override
  String get roleStudent => 'Student';

  @override
  String get roleTutor => 'Tutor';

  @override
  String get verifyAndContinue => 'Verify & continue';

  @override
  String get navToday => 'Today';

  @override
  String get navMaterials => 'Materials';

  @override
  String get navHomework => 'Homework';

  @override
  String get navProgress => 'Progress';

  @override
  String get settingsTitle => 'Settings';

  @override
  String get signOut => 'Sign out';

  @override
  String get welcomeStudent => 'Welcome, student';

  @override
  String get welcomeTutor => 'Welcome, tutor';

  @override
  String get todaySectionToday => 'Today';

  @override
  String get todaySectionUpcoming => 'Upcoming';

  @override
  String get todayEmptyState =>
      'No classes scheduled in the next two weeks.\nPull down to refresh.';

  @override
  String get todayLoadError => 'Could not load your classes.';

  @override
  String get retry => 'Retry';

  @override
  String get joinClass => 'Join';

  @override
  String get classCancelled => 'Cancelled';

  @override
  String get joinNoLinkYet =>
      'Attendance recorded — your tutor hasn\'t added a link yet.';

  @override
  String get tutorPlaceholderTitle => 'Today\'s classes will show up here';

  @override
  String get tutorPlaceholderBody =>
      'Run your teaching business from the web dashboard. This app is for on-the-go attendance and announcements — coming soon.';

  @override
  String get materialsTitle => 'Materials';

  @override
  String get batchesLoadError => 'Could not load your batches.';

  @override
  String get noEnrolledBatches => 'You\'re not enrolled in any batches yet.';

  @override
  String get materialsLoadError => 'Could not load materials.';

  @override
  String get bookmarkedSection => 'Bookmarked';

  @override
  String get noMaterialsYet => 'No materials yet.';

  @override
  String get removeBookmark => 'Remove bookmark';

  @override
  String get addBookmark => 'Bookmark';

  @override
  String get homeworkTitle => 'Homework';

  @override
  String get homeworkLoadError => 'Could not load homework.';

  @override
  String get noHomeworkYet => 'No homework yet.';

  @override
  String get takePhoto => 'Take a photo';

  @override
  String get chooseFromGallery => 'Choose from gallery';

  @override
  String get choosePdf => 'Choose a PDF';

  @override
  String get submitHomework => 'Submit homework';

  @override
  String get statusPending => 'Pending';

  @override
  String get statusSubmitted => 'Submitted';

  @override
  String get statusGraded => 'Graded';

  @override
  String gradeLabel(String grade) {
    return 'Grade: $grade';
  }

  @override
  String assignmentDueLine(String batchTitle, String dueDate) {
    return '$batchTitle · Due $dueDate';
  }

  @override
  String get progressTitle => 'Progress';

  @override
  String get progressLoadError => 'Could not load your progress.';

  @override
  String get attendanceLabel => 'Attendance';

  @override
  String get homeworkDoneLabel => 'Homework done';

  @override
  String get invalidInviteLink => 'This invite link is not valid.';

  @override
  String get youreIn => 'You\'re in';

  @override
  String joinedBatchMessage(String batchTitle) {
    return 'You\'ve joined $batchTitle. Your classes and homework will show up in the app.';
  }

  @override
  String get goToToday => 'Go to Today';

  @override
  String get invitedToJoin => 'You\'ve been invited to join';

  @override
  String get inviteInactive =>
      'This invite link is no longer active. Ask your tutor for a new one.';

  @override
  String get joinThisBatch => 'Join this batch';

  @override
  String get joining => 'Joining…';

  @override
  String get inviteParentSectionTitle => 'Link a parent';

  @override
  String get inviteParentSectionBody =>
      'Generate a code and share it with your parent — they\'ll use it to see your attendance, progress, and weekly digest.';

  @override
  String get generateParentInviteCode => 'Generate a code';

  @override
  String get generatingCode => 'Generating…';

  @override
  String get parentInviteDialogTitle => 'Share this code with your parent';

  @override
  String get parentInviteDialogBody =>
      'Send it to them on WhatsApp — they\'ll paste it into their own \"Link a child\" screen.';

  @override
  String get copyCode => 'Copy';

  @override
  String get codeCopied => 'Code copied';

  @override
  String get close => 'Close';

  @override
  String get accountSectionTitle => 'Your data';

  @override
  String get accountSectionBody =>
      'Export everything the app has on you, or permanently delete your account.';

  @override
  String get exportMyData => 'Export my data';

  @override
  String get preparingExport => 'Preparing export…';

  @override
  String get deleteMyAccount => 'Delete my account';

  @override
  String get deleteAccountWarning =>
      'This permanently deletes your account and signs you out everywhere. Your batches, attendance and fee records are kept for other people they belong to, but your contact details are removed and you can never sign back in with this number.';

  @override
  String get confirmDeleteAccount => 'Yes, permanently delete my account';

  @override
  String get cancel => 'Cancel';

  @override
  String get deleting => 'Deleting…';
}
