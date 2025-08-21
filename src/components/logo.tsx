import * as React from 'react';

export function Logo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>DataMaestro Logo</title>
      <path
        d="M6 2L20 2C24.4183 2 28 5.58172 28 10V22C28 26.4183 24.4183 30 20 30H6V2Z"
        fill="currentColor"
        className="text-primary/80"
      />
      <path
        d="M6 2L18 2C21.3137 2 24 4.68629 24 8V24C24 27.3137 21.3137 30 18 30H6V2Z"
        fill="currentColor"
        className="text-primary"
      />
    </svg>
  );
}
