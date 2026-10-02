import 'package:flutter/material.dart';
import '../../core/localization/app_localizations.dart';
import '../../models/case_status_model.dart';

class StatusBadge extends StatelessWidget {
  final String status;
  final bool isCompact;

  const StatusBadge({
    super.key,
    required this.status,
    this.isCompact = false,
  });

  @override
  Widget build(BuildContext context) {
    final statusType = CaseStatusHelper.fromString(status);
    final color = CaseStatusHelper.getColor(statusType);
    final icon = CaseStatusHelper.getIcon(statusType);
    final key = CaseStatusHelper.toKey(statusType);
    final label = AppLocalizations.of(context).translate(key);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: isCompact ? 8.0 : 12.0,
        vertical: isCompact ? 4.0 : 6.0,
      ),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.4), width: 1.2),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: isCompact ? 14 : 16, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: isCompact ? 12 : 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
