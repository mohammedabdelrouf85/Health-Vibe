class UserSession {
  final String uid;
  final String email;
  final String displayName;
  final String role; // patient, doctor, clinic_admin, super_admin
  final String? clinicId;
  final bool isEmailVerified;
  final List<String> permissions;

  UserSession({
    required this.uid,
    required this.email,
    required this.displayName,
    required this.role,
    this.clinicId,
    this.isEmailVerified = false,
    this.permissions = const [],
  });

  bool get isDoctor => role == 'doctor';
  bool get isPatient => role == 'patient';
  bool get isAdmin => role == 'clinic_admin' || role == 'super_admin';

  factory UserSession.fromJson(Map<String, dynamic> json) {
    final claims = json['customClaims'] as Map<String, dynamic>? ?? {};
    final permsRaw = json['permissions'] as List<dynamic>? ?? [];

    return UserSession(
      uid: json['uid']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      displayName: json['displayName']?.toString() ?? json['name']?.toString() ?? '',
      role: json['role']?.toString() ?? claims['role']?.toString() ?? 'patient',
      clinicId: json['clinicId']?.toString() ?? claims['clinicId']?.toString(),
      isEmailVerified: json['emailVerified'] == true,
      permissions: permsRaw.map((e) => e.toString()).toList(),
    );
  }

  Map<String, dynamic> toJson() => {
    'uid': uid,
    'email': email,
    'displayName': displayName,
    'role': role,
    'clinicId': clinicId,
    'isEmailVerified': isEmailVerified,
    'permissions': permissions,
  };
}
