/**
 * TemplateRenderer — renders HTML templates with variable substitution and conditional blocks.
 */
class TemplateRenderer {
  /**
   * Render a template with the given context.
   * @param {string} templateContent
   * @param {object} context
   * @returns {string}
   */
  static render(templateContent, context) {
    let content = templateContent;

    // Replace {{variable}} placeholders
    for (const [key, value] of Object.entries(context)) {
      if (value !== null && value !== undefined) {
        content = content.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), String(value));
      }
    }

    // Process {% if variable %}...{% endif %} blocks
    const ifPattern = /\{%\s*if\s+(\w+)\s*%\}(.*?)\{%\s*endif\s*%\}/gs;
    content = content.replace(ifPattern, (match, variable, innerContent) => {
      return context[variable] ? innerContent : "";
    });

    return content;
  }
}

module.exports = { TemplateRenderer };