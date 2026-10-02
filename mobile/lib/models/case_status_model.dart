import 'package:flutter/material.dart';
import '../core/constants/app_colors.dart';

enum CaseStatusType {
  pending,
  underReview,
  approved,
  needsFollowup,
  closed,
}

class CaseStatusHelper {
  static CaseStatusType fromString(String? status) {
    switch (status?.toLowerCase()) {
      case 'under_review':
      case 'underreview':
      case 'in_progress':
        return CaseStatusType.underReview;
      case 'approved':
      case 'certified':
        return CaseStatusType.approved;
      case 'needs_followup':
      case 'more_info_requested':
        return CaseStatusType.needsFollowup;
      case 'closed':
        return CaseStatusType.closed;
      case 'pending':
      default:
        return CaseStatusType.pending;
    }
  }

  static String toKey(CaseStatusType status) {
    switch (status) {
      case CaseStatusType.underReview:
        return 'status_under_review';
      case CaseStatusType.approved:
        return 'status_approved';
      case CaseStatusType.needsFollowup:
        return 'status_needs_followup';
      case CaseStatusType.closed:
        return 'status_closed';
      case CaseStatusType.pending:
        return 'status_pending';
    }
  }

  static Color getColor(CaseStatusType status) {
    switch (status) {
      case CaseStatusType.underReview:
        return AppColors.statusUnderReview;
      case CaseStatusType.approved:
        return AppColors.statusApproved;
      case CaseStatusType.needsFollowup:
        return AppColors.statusNeedsFollowup;
      case CaseStatusType.closed:
        return AppColors.statusClosed;
      case CaseStatusType.pending:
        return AppColors.statusPending;
    }
  }

  static IconData getIcon(CaseStatusType status) {
    switch (status) {
      case CaseStatusType.underReview:
        return Icons.search_rounded;
      case CaseStatusType.approved:
        return Icons.verified_rounded;
      case CaseStatusType.needsFollowup:
        return Icons.contact_support_rounded;
      case CaseStatusType.closed:
        return Icons.check_circle_outline_rounded;
      case CaseStatusType.pending:
        return Icons.hourglass_top_rounded;
    }
  }
}
