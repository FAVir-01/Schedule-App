import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { recordPerformanceMetric } from '../utils/performanceUtils';

export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      recoveryAttempt: 0,
      contentKey: 0,
    };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    recordPerformanceMetric('app.render-error', 0, {
      recoveryAttempt: this.state.recoveryAttempt,
      errorTypeKnown: Boolean(error?.name),
      componentStackAvailable: Boolean(info?.componentStack),
    });
  }

  handleRetry() {
    this.setState(
      (previous) => ({
        hasError: false,
        recoveryAttempt: previous.recoveryAttempt + 1,
        contentKey: previous.contentKey + 1,
      }),
      () => {
        recordPerformanceMetric('app.render-retry', 0, {
          recoveryAttempt: this.state.recoveryAttempt,
        });
      }
    );
  }

  render() {
    if (!this.state.hasError) {
      return React.createElement(
        React.Fragment,
        { key: this.state.contentKey },
        this.props.children
      );
    }

    return React.createElement(
      View,
      {
        style: boundaryStyles.container,
        accessibilityRole: 'alert',
      },
      React.createElement(Text, { style: boundaryStyles.title }, 'Algo deu errado'),
      React.createElement(
        Text,
        { style: boundaryStyles.message },
        'Seus dados continuam salvos neste aparelho. Tente carregar o aplicativo novamente.'
      ),
      React.createElement(
        Text,
        { style: boundaryStyles.secondaryMessage },
        'Something went wrong. Your local data remains saved.'
      ),
      React.createElement(
        Pressable,
        {
          style: boundaryStyles.retryButton,
          onPress: this.handleRetry,
          accessibilityRole: 'button',
          accessibilityLabel: 'Tentar novamente / Try again',
        },
        React.createElement(
          Text,
          { style: boundaryStyles.retryButtonText },
          'Tentar novamente'
        )
      )
    );
  }
}

const boundaryStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#f7f5ff',
  },
  title: {
    color: '#1a1a2e',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    marginTop: 12,
    color: '#625e78',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  secondaryMessage: {
    marginTop: 6,
    color: '#817d94',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    minHeight: 48,
    minWidth: 180,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: '#3c2ba7',
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default AppErrorBoundary;
