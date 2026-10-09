import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../security/secure_storage_service.dart';

class ApiResponse<T> {
  final bool isSuccess;
  final int statusCode;
  final T? data;
  final String? errorMessage;

  ApiResponse({
    required this.isSuccess,
    required this.statusCode,
    this.data,
    this.errorMessage,
  });
}

class ApiClient {
  static final ApiClient instance = ApiClient._internal();
  final http.Client _httpClient;
  final SecureStorageService _storage = SecureStorageService.instance;

  ApiClient._internal({http.Client? client}) : _httpClient = client ?? http.Client();

  // Factory constructor for mock injection in tests
  factory ApiClient.withClient(http.Client client) => ApiClient._internal(client: client);

  Future<Map<String, String>> _buildHeaders({bool requiresAuth = true}) async {
    final headers = <String, String>{
      'Content-Type': 'application/json; charset=UTF-8',
      'Accept': 'application/json',
      'X-Client-Platform': 'Flutter_Mobile',
    };

    if (requiresAuth) {
      final token = await _storage.getIdToken();
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }
    }
    return headers;
  }

  Future<ApiResponse<Map<String, dynamic>>> get(String url, {bool requiresAuth = true}) async {
    try {
      final headers = await _buildHeaders(requiresAuth: requiresAuth);
      final response = await _httpClient
          .get(Uri.parse(url), headers: headers)
          .timeout(const Duration(seconds: 15));

      return _processResponse(response);
    } on SocketException {
      return ApiResponse(isSuccess: false, statusCode: 0, errorMessage: 'No internet connection');
    } on TimeoutException {
      return ApiResponse(isSuccess: false, statusCode: 408, errorMessage: 'Request timed out');
    } catch (e) {
      return ApiResponse(isSuccess: false, statusCode: 500, errorMessage: e.toString());
    }
  }

  Future<ApiResponse<Map<String, dynamic>>> post(
    String url, {
    Map<String, dynamic>? body,
    bool requiresAuth = true,
  }) async {
    try {
      final headers = await _buildHeaders(requiresAuth: requiresAuth);
      final response = await _httpClient
          .post(
            Uri.parse(url),
            headers: headers,
            body: body != null ? jsonEncode(body) : null,
          )
          .timeout(const Duration(seconds: 15));

      return _processResponse(response);
    } on SocketException {
      return ApiResponse(isSuccess: false, statusCode: 0, errorMessage: 'No internet connection');
    } on TimeoutException {
      return ApiResponse(isSuccess: false, statusCode: 408, errorMessage: 'Request timed out');
    } catch (e) {
      return ApiResponse(isSuccess: false, statusCode: 500, errorMessage: e.toString());
    }
  }

  Future<ApiResponse<Map<String, dynamic>>> delete(String url, {bool requiresAuth = true}) async {
    try {
      final headers = await _buildHeaders(requiresAuth: requiresAuth);
      final response = await _httpClient
          .delete(Uri.parse(url), headers: headers)
          .timeout(const Duration(seconds: 15));

      return _processResponse(response);
    } on SocketException {
      return ApiResponse(isSuccess: false, statusCode: 0, errorMessage: 'No internet connection');
    } on TimeoutException {
      return ApiResponse(isSuccess: false, statusCode: 408, errorMessage: 'Request timed out');
    } catch (e) {
      return ApiResponse(isSuccess: false, statusCode: 500, errorMessage: e.toString());
    }
  }

  ApiResponse<Map<String, dynamic>> _processResponse(http.Response response) {
    final statusCode = response.statusCode;
    try {
      final body = response.body.isNotEmpty
          ? jsonDecode(response.body) as Map<String, dynamic>
          : <String, dynamic>{};

      if (statusCode >= 200 && statusCode < 300) {
        return ApiResponse(isSuccess: true, statusCode: statusCode, data: body);
      }

      // Handle 401 Unauthorized
      if (statusCode == 401) {
        _storage.wipeAll(); // Clean up expired session securely
      }

      final errorMsg = body['error'] ?? body['message'] ?? 'Request failed with status $statusCode';
      return ApiResponse(isSuccess: false, statusCode: statusCode, errorMessage: errorMsg.toString());
    } catch (e) {
      return ApiResponse(
        isSuccess: false,
        statusCode: statusCode,
        errorMessage: 'Invalid server response: ${response.body}',
      );
    }
  }
}
