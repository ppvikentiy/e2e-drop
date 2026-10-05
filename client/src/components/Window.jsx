import Icon from './Icon.jsx';

export default function Window({ title, onClose, closeLabel, children, as: Tag = 'section', className = '', ...props }) {
  return (
    <Tag className={`window ${className}`} {...props}>
      {title || onClose ? (
        <div className="window-bar">
          {title ? (
            <>
              <span className="window-prompt" aria-hidden="true">
                ▸
              </span>
              <span className="window-title">{title}</span>
            </>
          ) : (
            <span className="window-title" />
          )}
          {onClose ? (
            <button type="button" className="window-close" onClick={onClose} aria-label={closeLabel}>
              <Icon name="close" size={18} />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="window-body">{children}</div>
    </Tag>
  );
}
