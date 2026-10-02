import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

class VitalInputField extends StatelessWidget {
  final String label;
  final String hint;
  final String unit;
  final IconData icon;
  final TextEditingController controller;
  final ValueChanged<String>? onChanged;
  final String? Function(String?)? validator;
  final String? warningMessage;
  final Color? warningColor;

  const VitalInputField({
    super.key,
    required this.label,
    required this.hint,
    required this.unit,
    required this.icon,
    required this.controller,
    this.onChanged,
    this.validator,
    this.warningMessage,
    this.warningColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: AppColors.primary),
              const SizedBox(width: 8),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          TextFormField(
            controller: controller,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onChanged: onChanged,
            validator: validator,
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: const TextStyle(color: AppColors.textMuted, fontSize: 14),
              suffixText: unit,
              suffixStyle: const TextStyle(
                fontWeight: FontWeight.bold,
                color: AppColors.primaryDark,
              ),
              filled: true,
              fillColor: AppColors.surfaceLight,
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.cardBorder),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: warningColor ?? AppColors.cardBorder,
                  width: warningColor != null ? 1.5 : 1.0,
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: warningColor ?? AppColors.primary,
                  width: 2.0,
                ),
              ),
            ),
          ),
          if (warningMessage != null && warningMessage!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                Icon(
                  Icons.warning_amber_rounded,
                  size: 14,
                  color: warningColor ?? AppColors.statusNeedsFollowup,
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    warningMessage!,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: warningColor ?? AppColors.statusNeedsFollowup,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
