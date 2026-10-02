import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/localization/app_localizations.dart';

class LanguageSelector extends StatelessWidget {
  final Locale currentLocale;
  final ValueChanged<Locale> onLocaleChanged;

  const LanguageSelector({
    super.key,
    required this.currentLocale,
    required this.onLocaleChanged,
  });

  @override
  Widget build(BuildContext context) {
    final isAr = currentLocale.languageCode == 'ar';
    final l10n = AppLocalizations.of(context);

    return Container(
      decoration: BoxDecoration(
        color: AppColors.primaryLight.withOpacity(0.5),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.primary.withOpacity(0.2)),
      ),
      padding: const EdgeInsets.all(3.0),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildButton(
            label: l10n.translate('arabic'),
            isSelected: isAr,
            onTap: () => onLocaleChanged(const Locale('ar')),
          ),
          _buildButton(
            label: l10n.translate('english'),
            isSelected: !isAr,
            onTap: () => onLocaleChanged(const Locale('en')),
          ),
        ],
      ),
    );
  }

  Widget _buildButton({
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: AppColors.primary.withOpacity(0.3),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  )
                ]
              : null,
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? Colors.white : AppColors.primaryDark,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}
